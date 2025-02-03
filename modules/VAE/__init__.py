from utils.torch_utils import device_list, default_device
from utils.hf_utils import list_local_models
MODULE_MAP = {
    'LoadVAE': {
        'label': 'VAE Loader',
        'description': 'Load the VAE of a Stable Diffusion model',
        'category': 'vae',
        'params': {
            'model': {
                'label': 'VAE',
                'display': 'output',
                'type': 'vae',
            },
            'model_id': {
                'label': 'Model ID',
                'type': 'string',
                'options': list_local_models(),
                'display': 'autocomplete',
                'no_validation': True,
            },
        },
    },
    'VAEEncode': {
        'label': 'VAE Encode',
        'description': 'Encode an image into the latent space',
        'category': 'vae',
        'style': {
            'maxWidth': 300,
        },
        'params': {
            'model': {
                'label': 'VAE | Pipeline',
                'type': ['vae', 'pipeline'],
                'display': 'input',
            },
            'images': {
                'label': 'Images',
                'type': 'image',
                'display': 'input',
            },
            'latents': {
                'label': 'Latents',
                'type': 'latent',
                'display': 'output',
            },
            'divisible_by': {
                'label': 'Divisible By',
                'type': 'int',
                'default': 8,
                'display': 'slider',
                'min': 1,
            },
            'device': {
                'label': 'Device',
                'type': 'string',
                'options': device_list,
                'default': default_device,
            },
        },
    },
    'VAEDecode': {
        'label': 'VAE Decode',
        'description': 'Decode a latent space into an image',
        'category': 'vae',
        'params': {
            'model': {
                'label': 'VAE | Pipeline',
                'type': ['vae', 'pipeline'],
                'display': 'input',
            },
            'latents': {
                'label': 'Latents',
                'type': 'latent',
                'display': 'input',
            },
            'images': {
                'label': 'Images',
                'type': 'image',
                'display': 'output',
            },
            'device': {
                'label': 'Device',
                'type': 'string',
                'options': device_list,
                'default': default_device,
            },
        },
    },
}
