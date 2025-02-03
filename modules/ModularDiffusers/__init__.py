from utils.hf_utils import list_local_models
from utils.torch_utils import default_device, device_list, str_to_dtype
import torch

MODULE_MAP = {
    "PipelineLoader": {
        "label": "Model Loader",
        "category": "Modular Diffusers",
        "params": {
            "model_id": {
                "label": "Model ID",
                "options": list_local_models(),
                "display": "autocomplete",
                "no_validation": True,
                "default": "stabilityai/stable-diffusion-xl-base-1.0",
            },
            "pipeline": {
                "label": "Pipeline",
                "display": "output",
                "type": "pipeline",
            },
            "variant": {
                "label": "Variant",
                "options": ["[unset]", "fp32", "fp16"],
                "postProcess": lambda variant, params: variant
                if variant != "[unset]"
                else None,
                "default": "fp16",
            },
            "dtype": {
                "label": "Dtype",
                "type": "string",
                "options": ["auto", "float32", "float16", "bfloat16"],
                "default": "bfloat16" if torch.cuda.is_available() and torch.cuda.is_bf16_supported() else "float16",
                "postProcess": str_to_dtype,
            },
            # "unet": {
            #     "label": "Unet",
            #     "display": "output",
            #     "type": "unet",
            # },
            # "text_encoders": {
            #     "label": "Text Encoders",
            #     "display": "output",
            #     "type": "text_encoders",
            # },
            # "vae": {
            #     "label": "Vae",
            #     "display": "output",
            #     "type": "vae",
            # },
            # "scheduler": {
            #     "label": "Scheduler",
            #     "display": "output",
            #     "type": "scheduler",
            # },
        },
    },
    "EncodePrompts": {
        "label": "Encode Prompts",
        "category": "Modular Diffusers",
        "params": {
            "models": {
                "label": "Pipeline | Text Encoders",
                "display": "input",
                "type": ["text_encoders", "pipeline"],
            },
            "embeddings": {
                "label": "Embeddings",
                "display": "output",
                "type": "prompt_embeddings",
            },
            "positive_prompt": {
                "label": "Positive Prompt",
                "type": "string",
                "display": "textarea",
            },
            "negative_prompt": {
                "label": "Negative Prompt",
                "type": "string",
                "display": "textarea",
            },
            "device": {
                "label": "Device",
                "type": "string",
                "options": device_list,
                "default": default_device,
            },
        },
    },

    "DenoiseLoop": {
        "label": "Denoise Loop",
        "category": "Modular Diffusers",
        "params": {
            "pipeline": {
                "label": "Pipeline",
                "display": "input",
                "type": ["pipeline", "unet"],
            },
            "embeddings": {
                "label": "Embeddings",
                "display": "input",
                "type": "prompt_embeddings",
            },
            "latents": {
                "label": "Latents",
                "type": "latent",
                "display": "output",
            },
            'scheduler': {
                'label': 'Scheduler',
                'display': 'select',
                'type': ['string', 'scheduler'],
                'options': {
                    'DDIMScheduler': 'DDIM',
                    'DDPMScheduler': 'DDPM',
                    'DEISMultistepScheduler': 'DEIS Multistep',
                    'DPMSolverSinglestepScheduler': 'DPMSolver Singlestep',
                    'DPMSolverMultistepScheduler': 'DPMSolver Multistep',
                    'DPMSolverSDEScheduler': 'DPMSolver SDE',
                    'EDMEulerScheduler': 'EDM Euler',
                    'EulerDiscreteScheduler': 'Euler Discrete',
                    'EulerAncestralDiscreteScheduler': 'Euler Ancestral',
                    'HeunDiscreteScheduler': 'Heun Discrete',
                    'KDPM2DiscreteScheduler': 'KDPM2 Discrete',
                    'KDPM2AncestralDiscreteScheduler': 'KDPM2 Ancestral',
                    'LMSDiscreteScheduler': 'LMS Discrete',
                    'PNDMScheduler': 'PNDM',
                    'UniPCMultistepScheduler': 'UniPC Multistep',
                },
                'default': 'EulerDiscreteScheduler',
            },
            "cfg": {
                "label": "Guidance",
                "type": "float",
                "display": "slider",
                "default": 7.0,
                "min": 0,
                "max": 20,
            },
            "steps": {
                "label": "Steps",
                "type": "int",
                "default": 25,
                "min": 1,
                "max": 1000,
            },
            "seed": {
                "label": "Seed",
                "type": "int",
                "default": 0,
                "min": 0,
                "display": "random",
            },
            "width": {
                "label": "Width",
                "type": "int",
                "display": "text",
                "default": 1024,
                "min": 8,
                "max": 8192,
                "step": 8,
                "group": "dimensions",
            },
            "height": {
                "label": "Height",
                "type": "int",
                "display": "text",
                "default": 1024,
                "min": 8,
                "max": 8192,
                "step": 8,
                "group": "dimensions",
            },
            "image_latents": {
                "label": "Image Latents",
                "display": "input",
                "type": "image_latents",
            },
            "strength": {
                "label": "Strength",
                "type": "float",
                "display": "slider",
                "default": 0.5,
                "min": 0,
                "max": 1,
            },
            "guider": {
                "label": "Optional Guider",
                "type": "guider",
                "display": "input",
            },
            "device": {
                "label": "Device",
                "type": "string",
                "options": device_list,
                "default": default_device,
            },
        },
    },
}
