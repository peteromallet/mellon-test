import torch

schedulers_config = {
    'FlowMatchEulerDiscreteScheduler': {
        'num_train_timesteps': 1000,
        'shift': 3.0,
        'use_dynamic_shifting': False,
        'base_shift': 0.5,
        'max_shift': 1.15,
        'base_image_seq_len': 256,
        'max_image_seq_len': 4096,
        'invert_sigmas': False,
    },
    'FlowMatchHeunDiscreteScheduler': {
        'num_train_timesteps': 1000,
        'shift': 3.0,
    }
}

vae_config = {
    'SD3': {
        'in_channels': 3,
        'out_channels': 3,
        'down_block_types': ['DownEncoderBlock2D', 'DownEncoderBlock2D', 'DownEncoderBlock2D', 'DownEncoderBlock2D'],
        'up_block_types': ['UpDecoderBlock2D', 'UpDecoderBlock2D', 'UpDecoderBlock2D', 'UpDecoderBlock2D'],
        'block_out_channels': [128, 256, 512, 512],
        'layers_per_block': 2,
        'latent_channels': 16,
    }
}

def dummy_vae(model_id):
    from diffusers import AutoencoderKL
    config = vae_config[model_id]
    return AutoencoderKL(**config)


def get_clip_prompt_embeds(prompt, tokenizer, text_encoder, clip_skip=None, noise=0.0, scale=1.0):
    max_length = tokenizer.model_max_length
    bos = torch.tensor([tokenizer.bos_token_id]).unsqueeze(0).to(text_encoder.device)
    eos = torch.tensor([tokenizer.eos_token_id]).unsqueeze(0).to(text_encoder.device)
    one = torch.tensor([1]).unsqueeze(0).to(text_encoder.device)
    pad = tokenizer.pad_token_id

    text_input_ids = tokenizer(prompt, truncation=False, return_tensors="pt").input_ids.to(text_encoder.device)

    # remove start and end tokens
    text_input_ids = text_input_ids[:, 1:-1]

    # we create chunks of max_length-2, we add start and end tokens back later
    chunks = text_input_ids.split(max_length-2, dim=-1)

    concat_embeds = []
    pooled_prompt_embeds = None
    for chunk in chunks:
        mask = torch.ones_like(chunk)

        # add start and end tokens to each chunk
        chunk = torch.cat([bos, chunk, eos], dim=-1)
        mask = torch.cat([one, mask, one], dim=-1)

        # pad the chunk to the max length
        if chunk.shape[-1] < max_length:
            mask = torch.nn.functional.pad(mask, (0, max_length - mask.shape[-1]), value=0)
            chunk = torch.nn.functional.pad(chunk, (0, max_length - chunk.shape[-1]), value=pad)

        # encode the tokenized text
        prompt_embeds = text_encoder(chunk, attention_mask=mask, output_hidden_states=True)
        
        if pooled_prompt_embeds is None:
            pooled_prompt_embeds = prompt_embeds[0]

        if clip_skip is None:
            prompt_embeds = prompt_embeds.hidden_states[-2]
        else:
            prompt_embeds = prompt_embeds.hidden_states[-(clip_skip + 2)]

        concat_embeds.append(prompt_embeds)

    prompt_embeds = torch.cat(concat_embeds, dim=1)

    if scale != 1.0:
        prompt_embeds = prompt_embeds * scale
        pooled_prompt_embeds = pooled_prompt_embeds * scale

    if noise > 0.0:
        generator_state = torch.get_rng_state()

        seed = int(prompt_embeds.mean().item() * 1e6) % (2**32 - 1)
        torch.manual_seed(seed)
        embed_noise = torch.randn_like(prompt_embeds) * prompt_embeds.abs().mean() * noise
        #embed_noise = torch.randn_like(prompt_embeds) * noise
        prompt_embeds = prompt_embeds + embed_noise

        seed = int(pooled_prompt_embeds.mean().item() * 1e6) % (2**32 - 1)
        torch.manual_seed(seed)
        embed_noise = torch.randn_like(pooled_prompt_embeds) * pooled_prompt_embeds.abs().mean() * noise
        #embed_noise = torch.randn_like(pooled_prompt_embeds) * noise
        pooled_prompt_embeds = pooled_prompt_embeds + embed_noise

        torch.set_rng_state(generator_state)

    return (prompt_embeds, pooled_prompt_embeds)


def get_t5_prompt_embeds(prompt, tokenizer, text_encoder, num_images_per_prompt = 1, max_sequence_length=256, noise=0.0):
    prompt = [prompt] if isinstance(prompt, str) else prompt
    batch_size = len(prompt)
    # could be tokenizer.model_max_length but we are using a more conservative value (256)
    max_length = max_sequence_length
    eos = torch.tensor([1]).unsqueeze(0).to(text_encoder.device)
    pad = 0 # pad token is 0

    text_inputs_ids = tokenizer(prompt, truncation = False, add_special_tokens=True, return_tensors="pt").input_ids.to(text_encoder.device)

    # remove end token
    text_inputs_ids = text_inputs_ids[:, :-1]

    chunks = text_inputs_ids.split(max_length-1, dim=-1)

    concat_embeds = []
    for chunk in chunks:
        mask = torch.ones_like(chunk)

        # add end token back
        chunk = torch.cat([chunk, eos], dim=-1)
        mask = torch.cat([mask, eos], dim=-1)

        # pad the chunk to the max length
        if chunk.shape[-1] < max_length:
            mask = torch.nn.functional.pad(mask, (0, max_length - mask.shape[-1]), value=0)
            chunk = torch.nn.functional.pad(chunk, (0, max_length - chunk.shape[-1]), value=pad)

        # encode the tokenized text
        prompt_embeds = text_encoder(chunk)[0]
        concat_embeds.append(prompt_embeds)

    prompt_embeds = torch.cat(concat_embeds, dim=1)

    if noise > 0.0:
        generator_state = torch.get_rng_state()
        seed = int(prompt_embeds.mean().item() * 1e6) % (2**32 - 1)
        torch.manual_seed(seed)
        embed_noise = torch.randn_like(prompt_embeds) * prompt_embeds.abs().mean() * noise
        prompt_embeds = prompt_embeds + embed_noise
        torch.set_rng_state(generator_state)

    #_, seq_len, _ = prompt_embeds.shape
    # duplicate text embeddings and attention mask for each generation per prompt, using mps friendly method
    #prompt_embeds = prompt_embeds.repeat(1, num_images_per_prompt, 1)
    #prompt_embeds = prompt_embeds.view(batch_size * num_images_per_prompt, seq_len, -1)

    return prompt_embeds
