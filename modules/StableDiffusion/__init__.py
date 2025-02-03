from utils.hf_utils import list_local_models
from utils.torch_utils import device_list, default_device, str_to_dtype

list_local_models()

MODULE_MAP = {
    'UnetLoader': {
        'label': 'UNet Loader',
        'description': 'Load the UNet of a Stable Diffusion model',
        'category': 'samplers',
        'params': {
            'model': {
                'label': 'UNet',
                'type': 'UNet2DConditionModel',
                'display': 'output',
            },
            'model_id': {
                'label': 'Model ID',
                'type': 'string',
                'options': list_local_models(filters={'_class_name': r"StableDiffusionPipeline" }),
                'display': 'autocomplete',
                'no_validation': True,
                #'default': 'stabilityai/stable-diffusion-3.5-large',
            },
            'dtype': {
                'label': 'dtype',
                'options': ['auto', 'float32', 'float16', 'bfloat16'],
                'default': 'bfloat16',
                'postProcess': str_to_dtype,
            },
            'device': {
                'label': 'Device',
                'type': 'string',
                'options': device_list,
                'default': default_device,
            },
        },
    }
}