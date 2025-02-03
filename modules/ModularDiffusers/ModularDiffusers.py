from mellon.NodeBase import NodeBase
from utils.diffusers_utils import get_clip_prompt_embeds

from diffusers import (
    ControlNetModel,
    StableDiffusionXLModularPipeline,
    StableDiffusionXLPipeline,
)
from diffusers.pipelines.modular_pipeline_builder import SequentialPipelineBlocks
from diffusers.pipelines.stable_diffusion_xl.pipeline_stable_diffusion_xl_modular import (
    StableDiffusionXLAutoDenoiseStep,
    StableDiffusionXLAutoPrepareAdditionalConditioningStep,
    StableDiffusionXLAutoPrepareLatentsStep,
    StableDiffusionXLAutoSetTimestepsStep,
    StableDiffusionXLDecodeLatentsStep,
    StableDiffusionXLInputStep,
    StableDiffusionXLTextEncoderStep,
    StableDiffusionXLVAEEncoderStep,
)

import torch

class PipelineLoader(NodeBase):
    def execute(self, model_id, variant, dtype):
        pipeline = StableDiffusionXLPipeline.from_pretrained(
            model_id, variant=variant, torch_dtype=dtype
        )
        return {
            "pipeline": {
                "pipeline": pipeline,
                "unet": self.mm_add(pipeline.unet, priority=3),
                "text_encoder": self.mm_add(pipeline.text_encoder, priority=2),
                "text_encoder_2": self.mm_add(pipeline.text_encoder_2, priority=2),
                "vae": self.mm_add(pipeline.vae, priority=3),
            }
            # "unet": pipeline.unet,
            # "text_encoders": {
            #     "text_encoder": pipeline.text_encoder,
            #     "text_encoder_2": pipeline.text_encoder_2,
            #     "tokenizer": pipeline.tokenizer,
            #     "tokenizer_2": pipeline.tokenizer_2,
            # },
            # "vae": pipeline.vae,
            # "scheduler": pipeline.scheduler,
        }

class EncodePrompts(NodeBase):
    def execute(self, models, positive_prompt, negative_prompt, device):
        if not 'pipeline' in models and not 'text_encoder' in models:
            raise ValueError("No pipeline or text_encoders found in models")

        text_encoder = models['text_encoder'] if 'text_encoder' in models else models['pipeline'].text_encoder
        text_encoder_2 = models['text_encoder_2'] if 'text_encoder_2' in models else models['pipeline'].text_encoder_2
        tokenizer = models['tokenizer'] if 'tokenizer' in models else models['pipeline'].tokenizer
        tokenizer_2 = models['tokenizer_2'] if 'tokenizer_2' in models else models['pipeline'].tokenizer_2

        def encode(positive_prompt, negative_prompt, text_encoder, tokenizer, device, clip_skip=None, noise=0.0):
            text_encoder = self.mm_get(text_encoder).to(device)
            prompt_embeds, pooled_prompt_embeds = get_clip_prompt_embeds(positive_prompt, tokenizer, text_encoder, clip_skip=clip_skip, noise=noise)
            negative_prompt_embeds, negative_pooled_prompt_embeds = get_clip_prompt_embeds(negative_prompt, tokenizer, text_encoder, clip_skip=clip_skip, noise=noise)
            return (prompt_embeds, negative_prompt_embeds, pooled_prompt_embeds, negative_pooled_prompt_embeds)

        prompt_embeds, negative_prompt_embeds, _, _ = self.mm_try(
            lambda: encode(positive_prompt, negative_prompt, text_encoder, tokenizer, device),
            device,
            exclude=text_encoder
        )

        prompt_embeds_2, negative_prompt_embeds_2, pooled_prompt_embeds_2, negative_pooled_prompt_embeds_2 = self.mm_try(
            lambda: encode(positive_prompt, negative_prompt, text_encoder_2, tokenizer_2, device),
            device,
            exclude=text_encoder_2
        )
        
        prompt_embeds = torch.cat([prompt_embeds, prompt_embeds_2], dim=-1).to('cpu')
        negative_prompt_embeds = torch.cat([negative_prompt_embeds, negative_prompt_embeds_2], dim=-1).to('cpu')
        pooled_prompt_embeds = pooled_prompt_embeds_2.to('cpu')
        negative_pooled_prompt_embeds = negative_pooled_prompt_embeds_2.to('cpu')
        del prompt_embeds_2, negative_prompt_embeds_2, pooled_prompt_embeds_2, negative_pooled_prompt_embeds_2

        if prompt_embeds.shape[1] > negative_prompt_embeds.shape[1]:
            negative_prompt_embeds = torch.nn.functional.pad(negative_prompt_embeds, (0, 0, 0, prompt_embeds.shape[1] - negative_prompt_embeds.shape[1]))
        elif prompt_embeds.shape[1] < negative_prompt_embeds.shape[1]:
            prompt_embeds = torch.nn.functional.pad(prompt_embeds, (0, 0, 0, negative_prompt_embeds.shape[1] - prompt_embeds.shape[1]))
        
        return {"embeddings": {
            "prompt_embeds": prompt_embeds,
            "negative_prompt_embeds": negative_prompt_embeds,
            "pooled_prompt_embeds": pooled_prompt_embeds,
            "negative_pooled_prompt_embeds": negative_pooled_prompt_embeds,
        }}

class DenoiseLoop(NodeBase):
    def execute(
        self,
        pipeline,
        scheduler,
        embeddings,
        steps,
        cfg,
        seed,
        height,
        width,
        strength,
        image_latents,
        guider,
        device,
    ):
        class StableDiffusionXLMainSteps(SequentialPipelineBlocks):
            block_classes = [
                StableDiffusionXLInputStep,
                StableDiffusionXLAutoSetTimestepsStep,
                StableDiffusionXLAutoPrepareLatentsStep,
                StableDiffusionXLAutoPrepareAdditionalConditioningStep,
                StableDiffusionXLAutoDenoiseStep,
            ]
            block_prefixes = [
                "input",
                "set_timesteps",
                "prepare_latents",
                "prepare_add_cond",
                "denoise",
            ]

        sdxl_workflow = StableDiffusionXLMainSteps()

        generator = torch.Generator(device="cuda").manual_seed(seed)
        pipeline = pipeline['pipeline']
        unet = pipeline.unet

        # Load the scheduler
        scheduler_cls = getattr(__import__('diffusers', fromlist=[scheduler]), scheduler)
        scheduler = scheduler_cls.from_config(pipeline.scheduler.config)

        modules_kwargs = {
            "unet": unet,
            "scheduler": scheduler,
        }

        embeddings["prompt_embeds"] = embeddings["prompt_embeds"].to(device)
        embeddings["negative_prompt_embeds"] = embeddings["negative_prompt_embeds"].to(device)
        embeddings["pooled_prompt_embeds"] = embeddings["pooled_prompt_embeds"].to(device)
        embeddings["negative_pooled_prompt_embeds"] = embeddings["negative_pooled_prompt_embeds"].to(device)

        denoise_kwargs = {
            **embeddings,
            "generator": generator,
            "guidance_scale": cfg,
            "height": height,
            "width": width,
        }

        if guider is not None:
            modules_kwargs["guider"] = guider["guider"]
            denoise_kwargs["guider_kwargs"] = {"pag_scale": guider["scale"]}

        sdxl_workflow.update_states(**modules_kwargs)
        sdxl_node = StableDiffusionXLModularPipeline()
        sdxl_node.add_blocks(sdxl_workflow)

        sdxl_node.to(device)

        if image_latents is not None:
            denoise_kwargs["image"] = image_latents
            denoise_kwargs["strength"] = strength
            denoise_kwargs["num_inference_steps"] = round(steps / strength)
        else:
            denoise_kwargs["num_inference_steps"] = steps

        state_text2img = sdxl_node.run_blocks(**denoise_kwargs)

        latents = state_text2img.get_intermediate("latents")

        sdxl_node.to('cpu')
        latents.to('cpu')

        embeddings["prompt_embeds"] = embeddings["prompt_embeds"].to('cpu')
        embeddings["negative_prompt_embeds"] = embeddings["negative_prompt_embeds"].to('cpu')
        embeddings["pooled_prompt_embeds"] = embeddings["pooled_prompt_embeds"].to('cpu')
        embeddings["negative_pooled_prompt_embeds"] = embeddings["negative_pooled_prompt_embeds"].to('cpu')

        return {"latents": latents}