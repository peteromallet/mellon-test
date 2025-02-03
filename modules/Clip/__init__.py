from utils.torch_utils import device_list, default_device

MODULE_MAP = {
    'CLIPTextEncoderLoader': {
        'label': 'Load CLIP Text Encoders',
        'description': 'Load CLIP Text and Tokenizer encoders',
        'category': 'clip',
        'params': {
            'clip_text_encoders': {
                'label': 'Text Encoders',
                'display': 'output',
                'type': 'CLIPTextEncoders',
            },
            'model_id': {
                'label': 'Model ID',
                'type': 'string',
            },
            'dtype': {
                'label': 'Dtype',
                'type': 'string',
                'options': ['auto', 'float32', 'float16', 'bfloat16', 'float8_e4m3fn'],
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