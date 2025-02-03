from transformers import CLIPTextModel, CLIPTextModelWithProjection, CLIPTokenizer
from huggingface_hub import list_repo_files
from mellon.NodeBase import NodeBase

class CLIPTextEncoderLoader(NodeBase):
    def execute(self, model_id, dtype, device):
        files = list_repo_files(model_id)
        text_encoder = None
        tokenizer = None
        text_encoder_2 = None
        tokenizer_2 = None

        # for SD1.5, SD2 and SDXL load the text encoder and tokenizer from the subfolder
        if any('text_encoder/' in file for file in files):
            text_encoder = CLIPTextModelWithProjection.from_pretrained(model_id, subfolder="text_encoder", torch_dtype=dtype)
            tokenizer = CLIPTokenizer.from_pretrained(model_id, subfolder="tokenizer", torch_dtype=dtype)

            # for SDXL load the secondary text encoder and tokenizer from the subfolder
            if any('text_encoder_2/' in file for file in files):
                text_encoder_2 = CLIPTextModelWithProjection.from_pretrained(model_id, subfolder="text_encoder_2", torch_dtype=dtype)
                tokenizer_2 = CLIPTokenizer.from_pretrained(model_id, subfolder="tokenizer_2", torch_dtype=dtype)

        
        # if no encoder was found, try to load the encoder from the root
        else:
            text_encoder = CLIPTextModelWithProjection.from_pretrained(model_id, torch_dtype=dtype)
            tokenizer = CLIPTokenizer.from_pretrained(model_id, torch_dtype=dtype)

        return { 'clip_text_encoders': { 'text_encoder': text_encoder, 'tokenizer': tokenizer, 'text_encoder_2': text_encoder_2, 'tokenizer_2': tokenizer_2 , 'device': device }}
