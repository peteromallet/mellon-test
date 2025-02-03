from utils.torch_utils import device_list, default_device

MODULE_MAP = {
    'SigLIPLoader': {
        'label': 'SigLIP Model Loader',
        'description': 'Load the SigLIP model',
        'params': {
            'siglip_encoders': {
                'label': 'SigLIP Encoders',
                'display': 'output',
                'type': 'SigLIPEncoders',
            },
            'model_id': {
                'label': 'Model ID',
                'type': 'string',
                'default': 'google/siglip-so400m-patch14-384',
            },
            'dtype': {
                'label': 'Dtype',
                'type': 'string',
                'options': [ 'auto', 'float32', 'float16', 'bfloat16', 'float8_e4m3fn' ],
                'default': 'auto',
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
