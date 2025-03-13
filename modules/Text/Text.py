from mellon.NodeBase import NodeBase
import torch
import gc
import os
import time
import csv
import glob
import uuid
import numpy as np
import configparser
from PIL import Image, ImageDraw, ImageFont
from torch.cuda import synchronize
from diffusers import FlowMatchEulerDiscreteScheduler, AutoencoderKL, FluxPriorReduxPipeline
from diffusers.models.transformers.transformer_flux import FluxTransformer2DModel
from diffusers.pipelines.flux.pipeline_flux import FluxPipeline
from diffusers.utils import load_image
from transformers import CLIPTextModel, CLIPTokenizer, T5EncoderModel, T5TokenizerFast
from functools import wraps
from typing import List, Dict, Tuple
from huggingface_hub import login


##
# Other Node classes remain as before
##
class Text(NodeBase):
    def execute(self, text_field):
        return text_field

class Text2(NodeBase):
    def execute(self, text_field):
        return text_field

class DisplayText(NodeBase):
    def execute(self, text_in, text_in_2, video_display):
        print(text_in+text_in_2)
        return {"text_out": text_in + text_in_2, "video_out": text_in}

class LoadAudio(NodeBase):
    def execute(self, audio_file):
        return audio_file

class Timeline(NodeBase):
    def execute(self, audio_file, timestamps, timestamps_out=None):
        return {"audio_file_out": audio_file, "timestamps_to_pass": timestamps, "timestamps_out": timestamps}

class FluxTravelBase:
    """
    Utility class containing shared functionality for FluxTravel nodes.
    All methods are class methods to avoid initialization issues.
    """
    @classmethod
    def timing_decorator(cls, func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start = time.time()
            result = func(*args, **kwargs)
            duration = time.time() - start
            print(f"{func.__name__}: {duration:.2f}s")
            return result
        return wrapper

    @classmethod
    def add_timing_to_pipeline(cls, pipe):
        if hasattr(pipe, 'encode_image'):
            pipe.encode_image = cls.timing_decorator(pipe.encode_image)
        if hasattr(pipe, 'encode_prompt'):
            pipe.encode_prompt = cls.timing_decorator(pipe.encode_prompt)
        if hasattr(pipe, 'vae_encode'):
            pipe.vae_encode = cls.timing_decorator(pipe.vae_encode)
        return pipe

    @staticmethod
    def setup_pipeline():
        """
        Sets up the pipeline objects (FluxPipeline, prior, etc.).
        """
        # Read config and login to HuggingFace
        config = configparser.ConfigParser()
        config.read('config.ini')
        
        if 'huggingface' in config and 'token' in config['huggingface']:
            hf_token = config['huggingface']['token']
            login(token=hf_token)
        else:
            raise ValueError("HuggingFace token not found in config.ini")

        dtype = torch.bfloat16
        bfl_repo = "black-forest-labs/FLUX.1-schnell"
        revision = "refs/pr/1"

        scheduler = FlowMatchEulerDiscreteScheduler.from_pretrained(
            bfl_repo, subfolder="scheduler", revision=revision
        )
        text_encoder = CLIPTextModel.from_pretrained(
            "openai/clip-vit-large-patch14", torch_dtype=dtype
        )
        tokenizer = CLIPTokenizer.from_pretrained(
            "openai/clip-vit-large-patch14", torch_dtype=dtype
        )
        text_encoder_2 = T5EncoderModel.from_pretrained(
            bfl_repo, subfolder="text_encoder_2", torch_dtype=dtype, revision=revision
        )
        tokenizer_2 = T5TokenizerFast.from_pretrained(
            bfl_repo, subfolder="tokenizer_2", torch_dtype=dtype, revision=revision
        )
        vae = AutoencoderKL.from_pretrained(
            bfl_repo, subfolder="vae", torch_dtype=dtype, revision=revision
        )
        transformer = FluxTransformer2DModel.from_pretrained(
            bfl_repo, subfolder="transformer", torch_dtype=dtype, revision=revision
        )

        pipe = FluxPipeline(
            scheduler=scheduler,
            text_encoder=text_encoder,
            tokenizer=tokenizer,
            text_encoder_2=None,
            tokenizer_2=tokenizer_2,
            vae=vae,
            transformer=None,
        )
        pipe.text_encoder_2 = text_encoder_2
        pipe.transformer = transformer
        pipe.enable_model_cpu_offload()

        pipe = FluxTravelBase.add_timing_to_pipeline(pipe)

        # Also load the Redux pipeline
        repo_redux = "black-forest-labs/FLUX.1-Redux-dev"
        pipe_prior_redux = FluxPriorReduxPipeline.from_pretrained(
            repo_redux, 
            torch_dtype=dtype,
            use_auth_token=hf_token
        )
        pipe_prior_redux = FluxTravelBase.add_timing_to_pipeline(pipe_prior_redux)

        return pipe, pipe_prior_redux, dtype

    @staticmethod
    def slerp(val, low, high, eps=1e-6):
        """
        Spherical linear interpolation.
        """
        low_norm = low / (torch.norm(low, dim=-1, keepdim=True) + eps)
        high_norm = high / (torch.norm(high, dim=-1, keepdim=True) + eps)
        dot = (low_norm * high_norm).sum(-1, keepdim=True)
        dot = torch.clamp(dot, -1.0, 1.0)
        omega = torch.acos(dot)
        so = torch.sin(omega)
        return torch.where(
            so < eps,
            (1.0 - val) * low + val * high,
            ((torch.sin((1.0 - val) * omega) / so) * low +
             (torch.sin(val * omega) / so) * high)
        )

    @classmethod
    def blend_embeddings(cls, embeddings: List[Tuple[torch.Tensor, float]], blend_mode: str = 'linear') -> torch.Tensor:
        """
        Blend multiple embeddings according to strengths.
        """
        if blend_mode == 'linear':
            total = sum(strength for _, strength in embeddings)
            return sum(emb * (strength / total) for emb, strength in embeddings)
        elif blend_mode == 'slerp':
            # If only two embeddings, do a single slerp
            if len(embeddings) == 2:
                emb1, strength1 = embeddings[0]
                emb2, strength2 = embeddings[1]
                total = strength1 + strength2
                val = strength2 / total
                return cls.slerp(val, emb1, emb2)
            else:
                # Fallback if 3+ embeddings with slerp
                total = sum(strength for _, strength in embeddings)
                strengths = [strength / total for _, strength in embeddings]
                val1 = strengths[1] / (strengths[0] + strengths[1])
                intermediate = cls.slerp(val1, embeddings[0][0], embeddings[1][0])
                val2 = strengths[2]
                return cls.slerp(val2, intermediate, embeddings[2][0])
        else:
            raise ValueError(f"Unknown blend mode: {blend_mode}")

    @staticmethod
    def linear_interpolate(x1, y1, x2, y2, x):
        if abs(x2 - x1) < 1e-9:
            return y1
        ratio = (x - x1) / (x2 - x1)
        return y1 + ratio * (y2 - y1)

    @classmethod
    def generate_strength_data(cls, image_names, timestamps, fps, peak_strength,
                               low_strength, blend_amount):
        """
        Generate a list of dictionaries: each dict has frame #, time, and
        an array of strengths for each image.
        """
        N = len(image_names)
        boundaries = []

        # Calculate left/right boundaries for each image
        for i in range(N):
            if i == 0:
                lb = timestamps[0]
                rb = timestamps[0] + blend_amount * (timestamps[1] - timestamps[0]) if N > 1 else timestamps[0]
            elif i < N - 1:
                lb = timestamps[i] - blend_amount * (timestamps[i] - timestamps[i - 1])
                rb = timestamps[i] + blend_amount * (timestamps[i + 1] - timestamps[i])
            else:
                # Last image
                lb = timestamps[i] - blend_amount * (timestamps[i] - timestamps[i - 1])
                rb = timestamps[i]
            boundaries.append((lb, rb))

        final_timestamp = timestamps[-1]
        total_frames = int(np.ceil(final_timestamp * fps)) + 1

        data = []
        for frame_idx in range(total_frames):
            t = frame_idx / fps
            strengths_for_frame = []
            for i in range(N):
                lb, rb = boundaries[i]
                peak_time = timestamps[i]

                if i == N - 1 and abs(t - final_timestamp) < 1e-9:
                    strengths_for_frame.append(peak_strength)
                    continue

                # Outside active window
                if t < lb or t > rb:
                    strengths_for_frame.append(0.0)
                    continue

                if i == 0:
                    # First image
                    if t <= peak_time:
                        strengths_for_frame.append(peak_strength)
                    else:
                        val = cls.linear_interpolate(peak_time, peak_strength, rb, low_strength, t)
                        strengths_for_frame.append(val)
                elif i == N - 1:
                    # Last image
                    if t <= peak_time:
                        val = cls.linear_interpolate(lb, low_strength, peak_time, peak_strength, t)
                        strengths_for_frame.append(val)
                    else:
                        ramp_down_end = max(final_timestamp - 1.0/fps, peak_time)
                        if t < ramp_down_end:
                            val = cls.linear_interpolate(peak_time, peak_strength, ramp_down_end, low_strength, t)
                            strengths_for_frame.append(val)
                        else:
                            strengths_for_frame.append(low_strength)
                else:
                    # Intermediate images
                    if t <= peak_time:
                        val = cls.linear_interpolate(lb, low_strength, peak_time, peak_strength, t)
                    else:
                        val = cls.linear_interpolate(peak_time, peak_strength, rb, low_strength, t)
                    strengths_for_frame.append(val)

            # Round to 3 decimals
            strengths_for_frame = [float(f"{s:.3f}") for s in strengths_for_frame]
            data.append({
                'frame': frame_idx,
                'time': float(f"{t:.3f}"),
                'strengths': strengths_for_frame
            })

        return data

    @classmethod
    def process_image_batch(cls, image_paths: List[str],
                            pipe,
                            pipe_prior_redux,
                            frames_per_transition: List[int],
                            height: int = 720,
                            width: int = 720,
                            noise_blend_amount: float = 0.1,
                            num_inference_steps: int = 4,
                            guidance_scale: float = 1.5,
                            seed: int = 12345,
                            info_mode: bool = False,
                            low_strength: float = 0.0,
                            peak_strength: float = 1.0,
                            blend_mode: str = 'linear',
                            csv_only: bool = False,
                            blend_amount: float = 1.0):
        """
        Original approach: piecewise interpolation between consecutive images,
        given a fixed number of frames_per_transition between them.
        """
        generator = torch.Generator(device=pipe.device).manual_seed(seed)
        print(f"\nEncoding {len(image_paths)} images...")
        encoded_images = {}
        source_images = {}

        # Encode each image with the "Redux" pipeline
        for img_path in image_paths:
            img_name = os.path.basename(img_path)
            img = load_image(img_path)
            source_images[img_name] = img
            if not csv_only:
                base_output = pipe_prior_redux(
                    img,
                    prompt_embeds_scale=1.0,
                    pooled_prompt_embeds_scale=1.0
                )
                encoded_images[img_name] = {
                    'prompt_embeds': base_output['prompt_embeds'],
                    'pooled_prompt_embeds': base_output['pooled_prompt_embeds']
                }

        results = []
        generation_times = []
        frame_info = [] if info_mode or csv_only else None
        frame_number = 0

        # Generate frames for each pair
        for i in range(len(image_paths) - 1):
            img1_name = os.path.basename(image_paths[i])
            img2_name = os.path.basename(image_paths[i + 1])
            num_frames = frames_per_transition[i] if i < len(frames_per_transition) else frames_per_transition[-1]

            if not csv_only:
                print(f"\nGenerating {num_frames} frames between {img1_name} and {img2_name}")

            previous_latents = None
            for j in range(num_frames):
                # OLD Cosine-based interpolation:
                progress = j / (num_frames - 1) if num_frames > 1 else 0.0
                adjusted_progress = progress ** (1 / blend_amount)
                cos_progress = (1 - np.cos(adjusted_progress * np.pi)) / 2

                strength1 = (1 - cos_progress) * (peak_strength - low_strength) + low_strength
                strength2 = cos_progress * (peak_strength - low_strength) + low_strength
                total = strength1 + strength2
                strength1 /= total
                strength2 /= total

                if frame_info is not None:
                    active_images_paths = [image_paths[i], image_paths[i+1]]
                    active_strengths = [strength1, strength2]

                if not csv_only:
                    # Combine embeddings
                    prompt_embeds_list = [
                        (encoded_images[img1_name]['prompt_embeds'], strength1),
                        (encoded_images[img2_name]['prompt_embeds'], strength2)
                    ]
                    pooled_embeds_list = [
                        (encoded_images[img1_name]['pooled_prompt_embeds'], strength1),
                        (encoded_images[img2_name]['pooled_prompt_embeds'], strength2)
                    ]
                    combined_output = {
                        'prompt_embeds': cls.blend_embeddings(prompt_embeds_list, blend_mode),
                        'pooled_prompt_embeds': cls.blend_embeddings(pooled_embeds_list, blend_mode)
                    }

                    # Prepare latents
                    if previous_latents is None:
                        latents, _ = pipe.prepare_latents(
                            batch_size=1,
                            num_channels_latents=pipe.transformer.config.in_channels // 4,
                            height=height,
                            width=width,
                            dtype=pipe.dtype,
                            device=pipe.device,
                            generator=generator
                        )
                        batch_size, seq_len, hidden_dim = latents.shape
                        latents = latents.view(batch_size, seq_len, -1)
                    else:
                        new_latents, _ = pipe.prepare_latents(
                            batch_size=1,
                            num_channels_latents=pipe.transformer.config.in_channels // 4,
                            height=height,
                            width=width,
                            dtype=pipe.dtype,
                            device=pipe.device,
                            generator=generator
                        )
                        new_latents = new_latents.view(batch_size, seq_len, -1)
                        if noise_blend_amount is not None:
                            latents = (1 - noise_blend_amount) * previous_latents + noise_blend_amount * new_latents
                        else:
                            latents = previous_latents

                    previous_latents = latents

                    t_start = time.time()
                    image = pipe(
                        width=width,
                        height=height,
                        num_inference_steps=num_inference_steps,
                        guidance_scale=guidance_scale,
                        latents=latents,
                        **combined_output,
                    ).images[0]
                    gen_time = time.time() - t_start

                    if info_mode:
                        image = cls.add_frame_info(
                            image,
                            frame_number,
                            [source_images[os.path.basename(img_path)] for img_path in active_images_paths],
                            active_strengths
                        )

                    results.append(image)
                    generation_times.append(gen_time)

                if frame_info is not None:
                    frame_info_dict = {'frame': frame_number}
                    frame_info_dict[f'image_{i+1}_redux_strength'] = strength1
                    frame_info_dict[f'image_{i+2}_redux_strength'] = strength2
                    frame_info.append(frame_info_dict)

                frame_number += 1
                synchronize()
                gc.collect()
                torch.cuda.empty_cache()
                if not csv_only:
                    print(f"  Frame {j+1}/{num_frames}", end="\r")
            if not csv_only:
                print()  # new line

        return results, generation_times, frame_info

    @classmethod
    def process_timestamped_images(cls,
                                   image_paths: List[str],
                                   timestamps: List[float],
                                   fps: float,
                                   pipe,
                                   pipe_prior_redux,
                                   height: int = 720,
                                   width: int = 720,
                                   noise_blend_amount: float = 0.1,
                                   steps: int = 4,
                                   guidance_scale: float = 1.5,
                                   seed: int = 12345,
                                   info_mode: bool = False,
                                   low_strength: float = 0.0,
                                   peak_strength: float = 1.0,
                                   blend_mode: str = 'linear',
                                   csv_only: bool = False,
                                   blend_amount: float = 1.0):
        """
        Uses the new snippet-based curve to determine strengths for each image,
        given specific timestamps (in seconds).
        """
        if len(image_paths) != len(timestamps):
            raise ValueError("Number of images must match number of timestamps")
        if len(image_paths) < 2:
            raise ValueError("Need at least 2 images to create sequence")
        if not all(timestamps[i] < timestamps[i+1] for i in range(len(timestamps)-1)):
            raise ValueError("Timestamps must be in ascending order")

        generator = torch.Generator(device=pipe.device).manual_seed(seed)

        print(f"\nEncoding {len(image_paths)} images (timestamped logic)...")
        encoded_images = {}
        source_images = {}
        for img_path in image_paths:
            img_name = os.path.basename(img_path)
            img = load_image(img_path)
            source_images[img_name] = img
            if not csv_only:
                base_output = pipe_prior_redux(
                    img,
                    prompt_embeds_scale=1.0,
                    pooled_prompt_embeds_scale=1.0
                )
                encoded_images[img_name] = {
                    'prompt_embeds': base_output['prompt_embeds'],
                    'pooled_prompt_embeds': base_output['pooled_prompt_embeds']
                }

        results = []
        generation_times = []
        frame_info = [] if info_mode or csv_only else None

        # Strength data for each frame
        image_names_for_snippet = [os.path.basename(p) for p in image_paths]
        strength_data = cls.generate_strength_data(
            image_names_for_snippet,
            timestamps,
            fps,
            peak_strength,
            low_strength,
            blend_amount
        )

        previous_latents = None
        for frame_item in strength_data:
            frame_idx = frame_item['frame']
            strengths = frame_item['strengths']

            if frame_info is not None:
                info_dict = {'frame': frame_idx}
                for i, s in enumerate(strengths):
                    info_dict[f'image_{i+1}_redux_strength'] = s
                frame_info.append(info_dict)

            if csv_only:
                continue

            # Weighted sum of embeddings
            total_strength = sum(strengths)
            if total_strength < 1e-9:
                # All zero => produce random latents / skip
                combined_prompt_embeds = None
                combined_pooled_embeds = None
            else:
                emb_sum = None
                pooled_sum = None
                for i, val in enumerate(strengths):
                    if val <= 0.0:
                        continue
                    img_name = os.path.basename(image_paths[i])
                    w = val / total_strength
                    if emb_sum is None:
                        emb_sum = encoded_images[img_name]['prompt_embeds'] * w
                        pooled_sum = encoded_images[img_name]['pooled_prompt_embeds'] * w
                    else:
                        emb_sum = emb_sum + encoded_images[img_name]['prompt_embeds'] * w
                        pooled_sum = pooled_sum + encoded_images[img_name]['pooled_prompt_embeds'] * w

                combined_prompt_embeds = emb_sum
                combined_pooled_embeds = pooled_sum

            # Prepare latents
            if previous_latents is None:
                latents, _ = pipe.prepare_latents(
                    batch_size=1,
                    num_channels_latents=pipe.transformer.config.in_channels // 4,
                    height=height,
                    width=width,
                    dtype=pipe.dtype,
                    device=pipe.device,
                    generator=generator
                )
                batch_size, seq_len, hidden_dim = latents.shape
                latents = latents.view(batch_size, seq_len, -1)
            else:
                new_latents, _ = pipe.prepare_latents(
                    batch_size=1,
                    num_channels_latents=pipe.transformer.config.in_channels // 4,
                    height=height,
                    width=width,
                    dtype=pipe.dtype,
                    device=pipe.device,
                    generator=generator
                )
                new_latents = new_latents.view(batch_size, seq_len, -1)
                if noise_blend_amount is not None:
                    latents = (1 - noise_blend_amount) * previous_latents + noise_blend_amount * new_latents
                else:
                    latents = previous_latents

            previous_latents = latents

            if combined_prompt_embeds is None:
                combined_output = {}
            else:
                combined_output = {
                    'prompt_embeds': combined_prompt_embeds,
                    'pooled_prompt_embeds': combined_pooled_embeds
                }

            t_start = time.time()
            image = pipe(
                width=width,
                height=height,
                num_inference_steps=steps,
                guidance_scale=guidance_scale,
                latents=latents,
                **combined_output,
            ).images[0]
            gen_time = time.time() - t_start
            generation_times.append(gen_time)

            if info_mode:
                active_img_paths = image_paths
                active_strengths = strengths
                image = cls.add_frame_info(
                    image,
                    frame_idx,
                    [source_images[os.path.basename(p)] for p in active_img_paths],
                    active_strengths
                )

            results.append(image)

            synchronize()
            gc.collect()
            torch.cuda.empty_cache()

        return results, generation_times, frame_info

    @staticmethod
    def create_interpolation_video(results,
                                   output_path='interpolation.mp4',
                                   fps=12,
                                   resize_width=512,
                                   resize_height=512,
                                   audio_path=None,
                                   start_time=None,
                                   end_time=None,
                                   skip_frame_save=False,
                                   frame_info=None):
        """
        Create a video from a sequence of images; optionally attach audio.
        """
        import subprocess

        output_dir = os.path.splitext(output_path)[0] + "_frames"
        if not skip_frame_save:
            if os.path.exists(output_dir):
                import shutil
                shutil.rmtree(output_dir)
            os.makedirs(output_dir)

            print(f"\nSaving frames to {output_dir}/")
            for i, img in enumerate(results):
                img = img.resize((resize_width, resize_height), Image.Resampling.LANCZOS)
                frame_path = os.path.join(output_dir, f"frame_{i:04d}.png")
                img.save(frame_path)
                print(f"  Frame {i+1}/{len(results)}", end="\r")
            print()

            # Optionally save frame info to CSV
            if frame_info:
                csv_path = os.path.splitext(output_path)[0] + "_frame_info.csv"
                image_keys = set()
                for info in frame_info:
                    for key in info.keys():
                        if key.startswith('image_') and key.endswith('_redux_strength'):
                            image_keys.add(key)
                sorted_image_keys = sorted(image_keys)
                fieldnames = ['frame'] + [f'image_{key.split("_")[1]}' for key in sorted_image_keys]

                with open(csv_path, 'w', newline='') as f:
                    writer = csv.DictWriter(f, fieldnames=fieldnames)
                    writer.writeheader()
                    for info in frame_info:
                        row = {'frame': info['frame']}
                        for key in sorted_image_keys:
                            image_num = key.split('_')[1]
                            row[f'image_{image_num}'] = info.get(key, 0.0)
                        writer.writerow(row)

                print(f"Frame information saved to {csv_path}")

        # Build the video (via ffmpeg)
        try:
            current_dir = os.getcwd()
            os.chdir(output_dir)
            output_path_abs = os.path.abspath(os.path.join(current_dir, output_path))
            audio_path_abs = os.path.abspath(os.path.join(current_dir, audio_path)) if audio_path else None

            temp_video_path = f"{output_path_abs}.{uuid.uuid4()}.temp.mp4" if audio_path else None
            initial_output = temp_video_path if audio_path else output_path_abs

            ffmpeg_cmd = [
                "ffmpeg", "-y",
                "-framerate", str(fps),
                "-i", "frame_%04d.png",
                "-c:v", "libx264",
                "-preset", "medium",
                "-crf", "23",
                "-pix_fmt", "yuv420p",
                initial_output
            ]

            print(f"\nCreating video {output_path}")
            result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
            if result.returncode != 0:
                print("\nError creating video:")
                print("STDOUT:", result.stdout)
                print("STDERR:", result.stderr)
                raise subprocess.CalledProcessError(result.returncode, ffmpeg_cmd, result.stdout, result.stderr)

            # If we have audio, we need to run a second ffmpeg pass
            if audio_path:
                if not os.path.exists(audio_path_abs):
                    raise FileNotFoundError(f"Audio file not found: {audio_path_abs}")

                # Trim audio if needed
                probe_cmd = [
                    "ffprobe",
                    "-v", "error",
                    "-show_entries", "format=duration",
                    "-of", "default=noprint_wrappers=1:nokey=1",
                    audio_path_abs
                ]
                try:
                    audio_duration = float(subprocess.check_output(probe_cmd, text=True).strip())
                except (subprocess.CalledProcessError, ValueError):
                    audio_duration = None

                video_duration = len(results) / fps
                if start_time is not None and audio_duration is not None:
                    if start_time >= audio_duration:
                        raise ValueError(f"Start time {start_time}s is beyond audio duration {audio_duration}s")
                if end_time is not None and audio_duration is not None:
                    if end_time > audio_duration:
                        print(f"\nWarning: End time {end_time}s is beyond audio duration {audio_duration}s")
                        print("Audio will be shorter than video")

                audio_filter = []
                if start_time is not None or end_time is not None:
                    trim_args = []
                    if start_time is not None:
                        trim_args.append(f"start={start_time}")
                    if end_time is not None:
                        trim_args.append(f"end={end_time}")
                    audio_filter.append(f"atrim={':'.join(trim_args)}")
                    audio_filter.append("asetpts=PTS-STARTPTS")

                filter_str = ",".join(audio_filter) if audio_filter else None
                audio_cmd = [
                    "ffmpeg", "-y",
                    "-i", temp_video_path,
                    "-i", audio_path_abs
                ]
                if filter_str:
                    audio_cmd.extend(["-af", filter_str])
                audio_cmd.extend([
                    "-c:v", "copy",
                    "-c:a", "aac",
                    output_path_abs
                ])

                print("\nAdding audio to video")
                result = subprocess.run(audio_cmd, capture_output=True, text=True)
                if os.path.exists(temp_video_path):
                    os.remove(temp_video_path)

                if result.returncode != 0:
                    print("\nError adding audio:")
                    print("STDOUT:", result.stdout)
                    print("STDERR:", result.stderr)
                    raise subprocess.CalledProcessError(result.returncode, audio_cmd, result.stdout, result.stderr)

                if audio_duration is not None:
                    print(f"\nVideo duration: {video_duration:.2f}s")
                    print(f"Original audio duration: {audio_duration:.2f}s")
                    if start_time is not None or end_time is not None:
                        trimmed_duration = (end_time or audio_duration) - (start_time or 0)
                        print(f"Trimmed audio duration: {trimmed_duration:.2f}s")

            os.chdir(current_dir)
            print(f"Video saved successfully to {output_path}")

        except subprocess.CalledProcessError as e:
            print("\nFFmpeg error:")
            print("STDOUT:", e.stdout)
            print("STDERR:", e.stderr)
            raise
        except FileNotFoundError:
            print("\nError: ffmpeg not found. Please install ffmpeg to create videos.")
            print(f"The individual frames have been saved to {output_dir}.")

    @staticmethod
    def get_sorted_images(image_dir: str, sort_method: str = 'alpha') -> List[str]:
        """
        Get sorted list of image paths from a directory by name, numeric, or time.
        """
        image_paths = glob.glob(os.path.join(image_dir, "*.jpg")) + \
                      glob.glob(os.path.join(image_dir, "*.png"))
        if not image_paths:
            raise ValueError(f"No JPG/PNG images found in {image_dir}")

        if sort_method == 'alpha':
            return sorted(image_paths)
        elif sort_method == 'numeric':
            import re
            def natural_keys(text):
                return [int(c) if c.isdigit() else c.lower() for c in re.split('([0-9]+)', text)]
            return sorted(image_paths, key=natural_keys)
        elif sort_method == 'time':
            return sorted(image_paths, key=lambda x: os.path.getctime(x))
        else:
            raise ValueError(f"Unknown sort method: {sort_method}")

    @staticmethod
    def add_frame_info(image: Image.Image, frame_number: int,
                       images: List[Image.Image], strengths: List[float]) -> Image.Image:
        """
        Add frame information including source images and their strengths below the main image.
        """
        main_width = image.width
        main_height = image.height
        thumb_size = main_height // 4
        info_height = thumb_size + 150

        new_img = Image.new('RGB', (main_width, main_height + info_height), 'black')
        new_img.paste(image, (0, 0))
        draw = ImageDraw.Draw(new_img)

        try:
            font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 72)
            small_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 48)
            tiny_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 36)
        except:
            # Fallback if the system font is not found
            font = ImageFont.load_default()
            small_font = font
            tiny_font = font

        text = f"Frame {frame_number}"
        text_bbox = draw.textbbox((0, 0), text, font=font)
        text_width = text_bbox[2] - text_bbox[0]
        margin = 20
        draw.rectangle([(margin, margin), (text_width + margin*3, text_bbox[3] + margin*2)], fill='black')
        draw.text((margin*2, margin), text, font=font, fill='white')

        # Create thumbnails
        thumbs = []
        for source_img in images:
            thumb = source_img.copy()
            thumb.thumbnail((thumb_size, thumb_size), Image.Resampling.LANCZOS)
            thumbs.append(thumb)

        spacing = 20
        total_width = sum(thumb.width for thumb in thumbs) + spacing * (len(thumbs) - 1)
        start_x = (main_width - total_width) // 2
        y_pos = main_height + 20

        if len(images) == 2:
            labels = ["Current", "Next"]
        else:
            labels = [f"Img #{i+1}" for i in range(len(images))]

        current_x = start_x
        for i, (thumb, strength, label) in enumerate(zip(thumbs, strengths, labels)):
            label_bbox = draw.textbbox((0, 0), label, font=tiny_font)
            label_width = label_bbox[2] - label_bbox[0]
            label_x = current_x + (thumb.width - label_width) // 2
            draw.text((label_x, y_pos), label, font=tiny_font, fill='white')

            new_img.paste(thumb, (current_x, y_pos + 30))

            str_text = f"Strength: {strength:.3f}"
            text_bbox = draw.textbbox((0, 0), str_text, font=small_font)
            text_width = text_bbox[2] - text_bbox[0]
            text_x = current_x + (thumb.width - text_width) // 2
            text_y = y_pos + thumb.height + 40
            draw.text((text_x, text_y), str_text, font=small_font, fill='white')

            current_x += thumb.width + spacing

        return new_img

    @staticmethod
    def parse_frames_list(frames_str: str) -> List[int]:
        """
        Parse frames string into list of frame counts.
        Accepts either a single number or comma-separated list.
        """
        try:
            parts = frames_str.split(',')
            if len(parts) == 1:
                return [int(parts[0])]
            else:
                return [int(x) for x in parts]
        except ValueError:
            raise ValueError("frames_per_image must be an integer or comma-separated list of integers")

    @staticmethod
    def determine_output_size(first_image_path: str, size_option: str) -> Tuple[int, int]:
        """
        Determine output dimensions based on first image aspect ratio and size selection.
        Returns (width, height) tuple.

        Note: Flux requires dimensions to be multiples of 8.
        The size value represents the minimum dimension - the larger dimension
        will be scaled proportionally while maintaining aspect ratio.
        """
        from PIL import Image

        # Define base sizes for each option - all should be multiples of 8
        # These values represent the MINIMUM dimension
        SIZE_MAP = {
            "Small (512px)": 512,    # e.g. 512x720 for 2:3
            "Medium (720px)": 704,    # e.g. 704x1024 for 2:3
            "Large (1024px)": 896,    # e.g. 896x1280 for 2:3
        }
        min_size = SIZE_MAP[size_option]

        # Read first image dimensions
        with Image.open(first_image_path) as img:
            orig_width, orig_height = img.size
            aspect_ratio = orig_width / orig_height

        def make_multiple_of_8(dim: int) -> int:
            """Ensure dimension is a multiple of 8"""
            return (dim // 8) * 8

        # Instead of using the aspect ratio categories, we'll now just use
        # the aspect ratio directly to determine dimensions
        if aspect_ratio > 1:  # Wider than tall
            # Height becomes the minimum size
            height = min_size
            width = make_multiple_of_8(int(height * aspect_ratio))
        else:  # Taller than wide or square
            # Width becomes the minimum size
            width = min_size
            height = make_multiple_of_8(int(width / aspect_ratio))

        return (width, height)


#############################################################################
# Example specialized node class updated with your 4 requirements:
#############################################################################

class FluxTravelPrecise(NodeBase):
    """
    A node that expects a dict with 'audioFile' and 'timestamps' keys, e.g.:
      {
        'audioFile': '0210.MP3',
        'timestamps': [
           {'id': 'j45tre29f', 'time': '174.4210', 'image': None},
           {'id': 'disycad77', 'time': '314.8415', 'image': 'disycad77_Pantheon-Roma-dallalto.jpg'},
           {'id': 'imal920au', 'time': '542.2481', 'image': 'imal920au_Pantheon-Roma-dallalto.jpg'}
        ]
      }

    It will:
      1) Drop any timestamps that have no image
      2) Crop audio & timestamps so they begin at the first image
      3) Pass the pruned/shifted arrays to process_timestamped_images
      4) Then create_interpolation_video, trimming audio accordingly
    """

    def execute(self, data: Dict, fps: float, steps: int, size: str):
        """
        data: Dict with 'audioFile' and 'timestamps' as described
        fps: frames per second
        steps: diffusion steps
        size: size option for output dimensions
        """
        # -----------------------
        # 1) Drop timestamps with no image
        # -----------------------
        raw_list = data.get('timestamps', [])
        # Filter out entries that have 'image': None (or empty)
        filtered = [entry for entry in raw_list if entry.get('image')]

        if not filtered:
            raise ValueError("No timestamps have valid images!")

        # -----------------------
        # Convert times to float, sort ascending (just in case).
        # -----------------------
        for entry in filtered:
            entry['time'] = float(entry['time'])
        filtered.sort(key=lambda x: x['time'])

        # -----------------------
        # 2) Crop so the first timestamp is at t=0
        #    If the first image is at e.g. 1.0s, we remove that from all times
        #    and from the audio start.
        # -----------------------
        first_time = filtered[0]['time']
        for entry in filtered:
            entry['time'] -= first_time

        # We'll also set the audio start_time to `first_time`
        audio_file = data.get('audioFile', None)
        if audio_file:
            audio_file = os.path.join(os.getcwd(), "data", "files", audio_file)

        # -----------------------
        # Build arrays for process_timestamped_images
        # -----------------------
        image_paths = []
        times = []
        for entry in filtered:
            # If your actual images also reside in /data/files, do:
            img_path = os.path.join(os.getcwd(), "data", "files", entry['image'])
            image_paths.append(img_path)
            times.append(entry['time'])

        # Determine output dimensions based on first image
        width, height = FluxTravelBase.determine_output_size(image_paths[0], size)

        # -----------------------
        # 3) Pass these to process_timestamped_images
        # -----------------------
        pipe, pipe_prior_redux, _ = FluxTravelBase.setup_pipeline()

        print("Passing image_paths, times to process_timestamped_images:")
        print("image_paths=", image_paths)
        print("times=", times)
        print(f"Output dimensions: {width}x{height}")

        results, generation_times, frame_info = FluxTravelBase.process_timestamped_images(
            image_paths=image_paths,
            timestamps=times,
            fps=fps,
            pipe=pipe,
            pipe_prior_redux=pipe_prior_redux,
            steps=steps,
            info_mode=False,
            csv_only=False,
            height=height,
            width=width,
            blend_amount=1.1,
        )

        # -----------------------
        # 4) Create interpolation video
        #    We'll trim the audio from start_time=first_time onward,
        #    so everything lines up. We'll let end_time=None so it doesn't
        #    forcibly cut the end of the audio.
        # -----------------------
        output_path = f"/data/files/{uuid.uuid4()}.mp4"
        FluxTravelBase.create_interpolation_video(
            results,
            output_path=output_path,
            fps=fps,
            audio_path=audio_file,
            start_time=first_time,  # This is how we crop the audio start
            end_time=None,
            skip_frame_save=False,
            frame_info=frame_info,
            resize_width=width,
            resize_height=height
        )

        return {"output_path": output_path}


class FluxTravelLoose(NodeBase):
    """
    A node that expects just a list of images (and possibly frames per image)
    and does a simpler "loose" interpolation without strict timestamps.
    """
    def execute(self, images, frames_per_image, fps, sort_by, audio_file, size):
        # If images is a directory path, call FluxTravelBase.get_sorted_images()
        if isinstance(images, str) and os.path.isdir(images):
            image_paths = FluxTravelBase.get_sorted_images(images, sort_method=sort_by)
        elif isinstance(images, list):
            image_paths = images
        else:
            raise ValueError("Parameter 'images' must be either a directory path or a list of file paths")

        if not image_paths:
            raise ValueError("No images found!")

        # Determine output dimensions based on first image
        width, height = FluxTravelBase.determine_output_size(image_paths[0], size)
        print(f"Output dimensions: {width}x{height}")

        # Setup pipeline
        pipe, pipe_prior_redux, _ = FluxTravelBase.setup_pipeline()

        # Convert frames_per_image to list (in case user provides multiple segments)
        frames_list = FluxTravelBase.parse_frames_list(str(frames_per_image))

        # Use the older piecewise logic
        results, generation_times, frame_info = FluxTravelBase.process_image_batch(
            image_paths=image_paths,
            pipe=pipe,
            pipe_prior_redux=pipe_prior_redux,
            frames_per_transition=frames_list,
            height=height,
            width=width,
            noise_blend_amount=0.0,
            csv_only=False
        )

        # Create video
        output_path = f"/data/files/{uuid.uuid4()}.mp4"
        FluxTravelBase.create_interpolation_video(
            results,
            output_path=output_path,
            fps=fps,
            audio_path=audio_file,
            frame_info=frame_info,
            resize_width=width,
            resize_height=height
        )
        return {"output_path": output_path}

class PlayVideo(NodeBase):
    def execute(self, video_file, video_out=None):
        # Debug: log the received video_file value    
        print('PlayVideo: Received video_file:', video_file)
      
        return {"file_to_play": video_file}
    


'''
class DisplayText(NodeBase):
    def execute(self, text_in, text_in_2):
        return {"text_out": text_in + text_in_2}
'''
class Gallery(NodeBase):
    def execute(self, files, gallery_out, file_out=None):
        print("Gallery: Received new file:", files)
        print("Gallery: Existing files:", gallery_out)
        
        # Get existing files from the nested params structure
        existing_files = []
        if isinstance(gallery_out, dict):
            if 'value' in gallery_out:
                value = gallery_out.get('value', {})
                if isinstance(value, dict):
                    params = value.get('params', {})
                    if isinstance(params, dict):
                        existing_files = params.get('files', [])
            else:
                params = gallery_out.get('params', {})
                if isinstance(params, dict):
                    existing_files = params.get('files', [])
        
        # If no new file is provided, return the existing gallery without adding a new entry
        if files is None:
            print("Gallery: No new file provided; returning existing gallery unchanged")
            final_file_out = file_out if file_out is not None else ''
            result = {
                "gallery_out": {
                    "params": {
                        "component": "ui_gallery",
                        "files": existing_files
                    }
                },
                "file_out": str(final_file_out)
            }
            print("Gallery: Result:", result)
            return result

        # Process files parameter, supporting both single file and list of files
        print("Gallery: Files:", files)
        new_files = []
        if isinstance(files, list):
            for file_entry in files:
                if isinstance(file_entry, dict):
                    filename = file_entry.get('file') or file_entry.get('filename')
                    prompt = file_entry.get('prompt', '')
                else:
                    filename = file_entry
                    prompt = ''
                if isinstance(filename, str) and filename.startswith('data/files/'):
                    filename = filename.replace('data/files/', '')
                print("Gallery: Filename:", filename)
                new_files.append({
                    'filename': filename,
                    'starred': False,
                    'prompt': prompt
                })
        else:
            if isinstance(files, dict):
                filename = files.get('file') or files.get('filename')
                prompt = files.get('prompt', '')
            else:
                filename = files
                prompt = ''
            if isinstance(filename, str) and filename.startswith('data/files/'):
                filename = filename.replace('data/files/', '')
            print("Gallery: Filename:", filename)
            new_files.append({
                'filename': filename,
                'starred': False,
                'prompt': prompt
            })
        
        # Add new files to the beginning of existing files
        updated_files = new_files + existing_files
        
        # Determine final file_out using provided value if available
        final_file_out = file_out if file_out is not None else (new_files[0]['filename'] if new_files else '')
        
        # Return the params directly at the top level for the gallery
        result = {
            "gallery_out": {
                "params": {
                    "component": "ui_gallery",
                    "files": updated_files
                }
            },
            "gallery_out2": {
                "params": {
                    "component": "ui_gallery",
                    "files": updated_files
                },
            },
            "file_out": str(final_file_out)  # ensure file_out is always present as a string
        }

        print("Gallery: Result:", result)
        
        return result

class ImageUploader(NodeBase):
    def execute(self, files, prompt=""):
        output = {"gallery_output": {"file": files, "prompt": prompt}}
        print(self)
        print("ImageUploader: Output:", output)
        return output

class FluxWithLoRAs(NodeBase):
    def execute(self, prompt, lora_url=None, lora_strength=1.0, images_per_prompt=1, image_out=None):
        try:
            import fal_client
            import requests
            import uuid
            import os
            from PIL import Image
            from io import BytesIO
            
            # Function to handle progress updates
            def on_queue_update(update):
                if isinstance(update, fal_client.InProgress):
                    for log in update.logs:
                        print(log["message"])
            
            # Prepare arguments
            arguments = {"prompt": prompt, "lora_strength": lora_strength}
            print(f"lora_url: {lora_url}")
            # Add LoRA URL if provided
            if lora_url and lora_url.strip():
                arguments["lora_url"] = lora_url.strip()
                print(f"Using LoRA from: {lora_url}")
            
            # Include API key from environment variables
            from dotenv import load_dotenv
            load_dotenv()
            fal_api_key = os.getenv("FAL_KEY")
            print(f"FAL_KEY: {fal_api_key}")
            print(f"Generating image with prompt: {prompt}")
            
            outputs = []
            for i in range(int(images_per_prompt)):
                result = fal_client.subscribe(
                    "fal-ai/flux-lora",
                    arguments=arguments,
                    with_logs=True,
                    on_queue_update=on_queue_update,
                )
                print(f"result: {result}")
                if 'images' in result and len(result['images']) > 0 and 'url' in result['images'][0]:
                    image_url = result['images'][0]['url']
                else:
                    raise ValueError("No image URL in the response")

                response = requests.get(image_url)
                if response.status_code != 200:
                    raise ValueError(f"Failed to download image: {response.status_code}")
                
                img = Image.open(BytesIO(response.content))
                filename = f"{uuid.uuid4()}.png"
                output_path = os.path.join("data", "files", filename)
                os.makedirs(os.path.dirname(output_path), exist_ok=True)
                img.save(output_path)
                print(f"Image saved to: {output_path}")
                outputs.append({"file": output_path, "prompt": prompt})

            if len(outputs) == 1:
                final_output_data = outputs[0]
            else:
                final_output_data = outputs

            final_output = {"image_out": final_output_data}
            print("FluxWithLoRAs: Output:", final_output)
            return final_output
        except ImportError as e:
            print(f"Error: Required package not installed - {e}")
            return {"error": f"Required package not installed: {e}"}
        except Exception as e:
            print(f"Error generating image: {e}")
            return {"error": f"Error generating image: {e}"}