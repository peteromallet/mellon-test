import torch
from diffusers import AutoencoderKL
from mellon.NodeBase import NodeBase
from utils.hf_utils import is_local_files_only
from utils.torch_utils import toPIL, toLatent
from diffusers.models.attention_processor import AttnProcessor2_0, XFormersAttnProcessor

class LoadVAE(NodeBase):
    #is_compiled = False
    
    def execute(self, model_id):
        #if not compile and self.is_compiled:
        #    self.mm_unload(vae)

        vae = AutoencoderKL.from_pretrained(
            model_id, 
            subfolder="vae", 
            local_files_only=is_local_files_only(model_id),
        )

        vae._mm_id = self.mm_add(vae, priority=2)

        """
        if compile:
            # we free up all the GPU memory to perform the intensive compilation
            memory_manager.unload_all(exclude=vae)

            torch._inductor.config.conv_1x1_as_mm = True
            torch._inductor.config.coordinate_descent_tuning = True
            torch._inductor.config.epilogue_fusion = False
            torch._inductor.config.coordinate_descent_check_all_directions = True

            compiled = self.mm_load(vae, device=device).to(memory_format=torch.channels_last)
            compiled.decode = torch.compile(compiled.decode, mode='max-autotune', fullgraph=True)
            self.mm_update(vae, model=compiled)
            del compiled
            memory_flush(rest=True)
            self.is_compiled = True
        """

        return { 'model': vae }

class VAEEncode(NodeBase):
    def execute(self, model, images, divisible_by, device):
        vae = model.vae if hasattr(model, 'vae') else model
        if divisible_by > 1:
            from modules.BasicImage.BasicImage import ResizeToDivisible
            images = ResizeToDivisible()(images=images, divisible_by=divisible_by)['images_out']
        
        self.mm_load(vae, device)
        latents = self.mm_inference(
            lambda: self.encode(vae, images),
            device,
            exclude=vae
        )
        latents = latents.to('cpu')
        return { 'latents': latents }
    
    def encode(self, model, images):
        images = toLatent(images).to(model.device, dtype=model.dtype)
        latents = model.encode(images).latent_dist.sample()
        latents = latents * model.config.scaling_factor
        return latents

class VAEDecode(NodeBase):
    def execute(self, model, latents, device):
        vae = model.vae if hasattr(model, 'vae') else model
        self.mm_load(vae, device)
        images = self.mm_inference(
            lambda: self.vae_decode(vae, latents),
            device,
            exclude=vae
        )

        return { 'images': images }
    
    def vae_decode(self, model, latents):
        dtype = model.dtype
        
        if dtype == torch.float16 and model.config.force_upcast:
            self.upcast_vae(model)

        if hasattr(model, 'post_quant_conv') and hasattr(model.post_quant_conv, 'parameters'):
            latents = latents.to(dtype=next(iter(model.post_quant_conv.parameters())).dtype)
        else:
            latents = latents.to(dtype=model.dtype)

        latents = 1 / model.config['scaling_factor'] * latents
        images = model.decode(latents.to(model.device), return_dict=False)[0]
        del latents, model
        images = images / 2 + 0.5
        images = toPIL(images.to('cpu'))
        return images
    
    def upcast_vae(self, model):
        dtype = model.dtype
        if torch.cuda.is_available() and torch.cuda.is_bf16_supported():
            new_dtype = torch.bfloat16
        else:
            new_dtype = torch.float32

        model.to(dtype=new_dtype)
        use_torch_2_0_or_xformers = isinstance(
            model.decoder.mid_block.attentions[0].processor,
            (
                AttnProcessor2_0,
                XFormersAttnProcessor,
            ),
        )
        # if xformers or torch_2_0 is used attention block does not need
        # to be in float32 which can save lots of memory
        if use_torch_2_0_or_xformers:
            model.post_quant_conv.to(dtype)
            model.decoder.conv_in.to(dtype)
            model.decoder.mid_block.to(dtype)
