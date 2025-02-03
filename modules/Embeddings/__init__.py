
MODULE_MAP = {
    'CombineEmbeddings': {
        'label': 'Combine Embeddings',
        'category': 'text-encoders',
        'params': {
            'embeddings_1': {
                'label': 'Embeddings 1',
                'type': 'SD3Embeddings',
                'display': 'input',
            },
            'embeddings_2': {
                'label': 'Embeddings 2',
                'type': 'SD3Embeddings',
                'display': 'input',
            },
            'embeddings_out': {
                'label': 'Embeddings',
                'type': 'embeddings',
                'display': 'output',
            },
            'ratio': {
                'label': 'Ratio',
                'type': 'float',
                'default': 0.5,
                'step': 0.01,
                'display': 'slider',
                'min': 0,
                'max': 1,
            },
        },
    },
}
