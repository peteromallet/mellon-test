from config import config
from utils.hf_utils import list_local_models
from utils.torch_utils import device_list
from mellon.NodeBase import NodeBase
from diffusers import DiffusionPipeline
import torch

HF_TOKEN = config.hf['token']

class DiffusionPipelineLoader(NodeBase):
    def execute(self,
                model_id,
                online_status,
                dtype,
                offload_strategy,
                variant,
                revision,
                device,
                use_safetensors,
                ):
        
        is_local = model_id in list_local_models()
        local_files_only = online_status == 'Local files only' or (online_status == 'Connect if needed' and is_local)
        token = HF_TOKEN

        pipeline = DiffusionPipeline.from_pretrained(
            model_id,
            token=token,
            local_files_only=local_files_only,
            torch_dtype=dtype,
            use_safetensors=use_safetensors,
            revision=revision if revision else None,
            variant=variant if variant else None,
        )

        device = device_list[device]['device'] if device in device_list else 'cuda'

        if offload_strategy == 'Model offload (diffusers)':
            pipeline.enable_model_cpu_offload(device=device)
            device = None
        elif offload_strategy == 'Sequential offload (diffusers)':
            pipeline.enable_sequential_cpu_offload(device=device)
            device = None

        return { 'diffusion_pipeline': { 'pipeline': pipeline, 'device': device } }

class DiffusionPipelineSampler(NodeBase):
    def execute(
            self,
            diffusion_pipeline,
            seed,
            prompt,
            steps,
            cfg,
            width,
            height,
        ):
        pipeline = diffusion_pipeline['pipeline']
        device = diffusion_pipeline['device']

        if device:
            pipeline.to(device)

        generator = torch.Generator(device=device).manual_seed(seed)

        images = pipeline(
            prompt=prompt,
            num_inference_steps=steps,
            guidance_scale=cfg,
            width=width,
            height=height,
            generator=generator,
        )

        return { 'images': images[0] }



