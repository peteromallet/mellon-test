MODULE_MAP = {
    "Text": {
        "label": "Text",
        "description": "Text",    
        "category": "text",
        "type": "tool",
        "execution_type": "continuous",
        "params": {
            "text": {
                "label": "Text (Continuous)",
                "type": "string",
                "display": "output",
            },
            "text_field": {
                "label": "Text Field",
                "type": "string",
                "display": "textarea",
            }
        }
    },
    "Text2": {
        "label": "Text (Button)",
        "description": "Text",
        "category": "text",        
        "type": "tool",
        "execution_type": "button",
        "params": {
            "text": {
                "label": "Text",
                "type": "string",
                "display": "output",
            },
            "text_field": {
                "label": "Text Field",
                "type": "string",
                "display": "textarea",
            }
        }
    },

    "DisplayText": {
        "label": "Display Text",
        "description": "Display text",
        "category": "text",
        "type": "tool",
        "params": {
            "text_in": {
                "label": "Text Input",
                "type": "string",
                "display": "input",
            },
            "text_in_2": {
                "label": "Text Input",
                "type": "string",
                "display": "input",
            },
            
            "text_display": {
                "label": "Text",
                "type": "text",
                "display": "ui",
                "source": "text_out",
            },
            "video_display": {
                "label": "Video",
                "type": "text",
                "display": "ui_video",                
                "source": "media_out",
            }
        }
    },
    "Timeline": {
        "label": "Timeline",
        "description": "Timeline",
        "category": "text",
        "type": "tool",
        "execution_type": "button",
        "params": {
            "audio_file": {
                "label": "Audio File",
                "type": "audio",
                "display": "input",
                },
            "timestamps": {
                "label": "Timestamps",
                "type": "timeline",
                "display": "ui_timeline",
            },
            "timestamps_out": {
                "label": "Timeline",
                "type": "timeline",
                "source": "timestamps_to_pass",
                "display": "output",
                
            }
        }
    },
    "GeneratePrompts": {
        "label": "Generate Prompts",
        "description": "Generate a placeholder list of prompts",
        "category": "text",
        "type": "tool",
        "execution_type": "button",
        "params": {
            "mode": {
                "label": "Mode",
                "type": "dropdown",
                "options": ["Generate New", "Edit Existing", "Add To Existing"],
                "default": "Generate New",
            },
            "instructions": {
                "label": "Instructions",
                "type": "string",
                "display": "textarea",
            },
            "num_to_generate": {
                "label": "How many to generate",
                "type": "number",
                "default": 3,
                "min": 1,
                "max": 64,
                "display": "slider"
            },
            "prompts_in": {
                "label": "Prompts Input",
                "type": "json",
                "display": "input",
            },
            "prompts_out": {
                "label": "Prompts Output",
                "type": "json",
                "display": "output",
                "source": "prompts_out"
            }
        }
    },
    "PromptListNode": {
        "label": "Prompt List",
        "description": "Create and manage a list of prompts",
        "category": "text",        
        "type": "tool",
        "execution_type": "button",
        "params": {
            "prompts_in": {
                "label": "Prompts Input",
                "type": "json",
                "display": "input",
            },
            "mode": {
                "label": "Input Mode",
                "type": "dropdown",
                "options": ["Replace Existing", "Add To Existing"],
                "default": "Replace Existing",
                "description": "How should the 'Prompts Input' affect the current list?"
            },
            "prompts": {
                "label": "Prompts",
                "type": "json",
                "display": "ui_promptlist",
                "source": "prompts_out"
            },
            "prompts_out": {
                "label": "Prompts Output",
                "type": "json",
                "display": "output",
                "source": "prompts_out"
            }
        }
    },
    "LoadAudio": {
        "label": "Load Audio",
        "description": "Load audio",
        "category": "text",
        "execution_type": "button",
        "params": {
            "audio_file": {
                "label": "Audio File",
                "type": "audio",
                "display": "filebrowser",
            },
            "audio_file_out": {
                "label": "Audio File",
                "type": "audio",
                "display": "output",
            }
        }
    },
    "FluxTravelPrecise": {
        "label": "Flux Travel (Precise)",
        "description": "Flux Travel",
        "type": "tool",
        "category": "text",
        "execution_type": "button",
        "params": {
            "data": {
                "label": "Data",
                "type": "timeline",
                "display": "input"
            },
            "fps": {
                "label": "FPS",
                "type": "number",
                "default": 30,                
                'min': 1,
                'max': 100,
            },
            "steps": {
                "label": "Steps",
                "type": "number",
                "default": 4,                
                'min': 1,
                'max': 10,
            },
            "size": {
                "label": "Size",
                "type": "dropdown",
                "options": ["Small (512px)", "Medium (720px)", "Large (1024px)"],
                "default": "Medium (720px)",
            },
            "video_out": {
                "label": "Video",
                "type": "video",
                "display": "output",
            }
        }
    },
    "FluxTravelLoose": {
        "label": "Flux Travel (Loose)",
        "description": "Flux Travel",
        "type": "tool",
        "category": "text",
        "execution_type": "button",
        "params": {
            "images": {
                "label": "Images",
                "type": "image",
                "display": "input",
            },            
            "audio_file": {
                "label": "Audio File",
                "type": "audio",
                "display": "input",
            },
            "frames_per_image": {
                "label": "Number of Frames",
                "type": "number",
                "default": 16,                
                'min': 1,
                'max': 100,
            },
            "fps": {
                "label": "FPS",
                "type": "number",
                "default": 30,
                'min': 1,
                'max': 60,
            },
            "sort_by": {
                "label": "Sort By",
                "type": "dropdown",                                
                "options": ["timestamp", "image_name"],
            },
            "size": {
                "label": "Size",
                "type": "dropdown",
                "options": ["Small (512px)", "Medium (720px)", "Large (1024px)"],
                "default": "Medium (720px)",
            },
            "video_out": {
                "label": "Video",
                "type": "video",
                "display": "output",
            }
        }
    },
    "PlayVideo": {
        "label": "Play Video",
        "description": "Play video",
        "type": "tool",
        "category": "text",
        "execution_type": "button",
        "params": {
            "video_file": {
                "label": "Video File",
                "type": "string",
                "display": "input",
            },
            "video_out": {
                "label": "Video",
                "type": "string",                
                "display": "ui_video",                          
                "source": "file_to_play",
            }
        }
    },
    "Gallery": {
        "label": "Gallery",
        "description": "Gallery",
        "type": "tool",
        "category": "text",        
        "execution_type": "button",
        "params": {
            "media_out": {
                "label": "Files",
                "type": "json",
                "display": "input",
            },
            "gallery_out": {
                "label": "Gallery",
                "type": "json",                
                "display": "ui_gallery",     
                "source": "gallery_out",           
            },
            "file_out": {
                "label": "Files",
                "type": "file",
                "display": "output",
                "source": "file_out",
            }

        }
    },
    "ImageUploader": {
        "label": "Image Uploader",
        "description": "Upload images with prompts to a gallery",
        "type": "tool",
        "execution_type": "button",
        "category": "text",
        "params": {
            "files": {
                "label": "Upload Images",
                "type": "text",
                "display": "filebrowser",
                "fileType": "image",                
            },
            "prompt": {
                "label": "Image Prompt/Description",
                "type": "text",                                                
            },
            "gallery_output": {
                "label": "Gallery Output",
                "type": "text",                
                "display": "output"
            }
        }
    },
    "FluxWithLoRAs": {
        "label": "Flux with LoRAs",
        "description": "Flux with LoRAs",
        "type": "tool",
        "category": "text",
        "execution_type": "button",
        "params": {
            "lora_url": {
                "label": "LoRA URL",
                "type": "string",
                "display": "textarea"
            },
            "prompt": {
                "label": "Prompt",
                "type": "string",
                "display": "textarea",
            },
            "prompts": {
                "label": "Prompts List",
                "type": "json",
                "display": "input",
                "description": "Provide multiple prompts as a JSON list; overrides the single prompt if provided."
            },
            "aspect_ratio": {
                "label": "Aspect Ratio",
                "type": "string",
                "options": [
                    "Square HD (1:1)",
                    "Square (1:1)",
                    "Portrait 4:3",
                    "Portrait 16:9",
                    "Landscape 4:3",
                    "Landscape 16:9"
                ],
                "default": "Square HD (1:1)",
                "description": "Select the aspect ratio for your generated image"
            },
            "lora_strength": {
                "label": "LoRA Strength",
                "type": "number",
                "default": 1.0,
                "min": 0.0,
                "max": 1.5,
                "step": 0.01,
                "display": "slider"
            },
            "images_per_prompt": {
                "label": "Images Per Prompt",
                "type": "number",
                "default": 1,
                "min": 1,
                "max": 10,
                "display": "slider"
            },
            "media_out": {
                "label": "Image",
                "type": "text",
                "display": "output",
                "source": "media_out"
            }
        }
    },
    "WanWithLoRA": {
        "label": "WAN2.1 with LoRA",
        "description": "Generate animations using WAN2.1 with LoRA via Replicate API",
        "type": "tool",
        "category": "animation",
        "execution_type": "button",
        "params": {
            "prompts": {
                "label": "Prompts List",
                "type": "json",
                "display": "input",
                "description": "Connect to a PromptList or Gallery node to process multiple prompts/images"
            },
            "prompt_start": {
                "label": "Start of Prompt",
                "type": "string",
                "display": "textarea",
            },
            "prompt_end": {
                "label": "End of Prompt",
                "type": "string",
                "display": "textarea",
            },
            "generate_starred_only": {
                "label": "Generate Starred Only",
                "type": "boolean",
                "default": False,
                "description": "If true, only generate for starred gallery items"
            },
            "lora_url": {
                "label": "LoRA URL",
                "type": "string",
                "display": "textarea",
            },
            "model_size": {
                "label": "Model Size",
                "type": "dropdown",
                "options": ["14b", "1.3b"],
                "default": "14b",
            },
            "frames": {
                "label": "Frames",
                "type": "number",
                "default": 81,
                "min": 1,
                "max": 180,
                "display": "slider"
            },
            "resolution": {
                "label": "Resolution",
                "type": "dropdown",
                "options": ["480p", "720p"],
                "default": "480p",
            },
            "aspect_ratio": {
                "label": "Aspect Ratio",
                "type": "dropdown",
                "options": ["1:1", "4:3", "16:9", "9:16", "2:3", "3:2"],
                "default": "9:16",
            },
            "fast_mode": {
                "label": "Fast Mode",
                "type": "dropdown",
                "options": ["Off", "On"],
                "default": "Off",
            },
            "sample_steps": {
                "label": "Sample Steps",
                "type": "number",
                "default": 30,
                "min": 1,
                "max": 100,
                "display": "slider"
            },
            "sample_shift": {
                "label": "Sample Shift",
                "type": "number",
                "default": 8,
                "min": 0,
                "max": 20,
                "display": "slider"
            },
            "sample_guide_scale": {
                "label": "Guide Scale",
                "type": "number",
                "default": 5,
                "min": 1,
                "max": 10,
                "step": 0.1,
                "display": "slider"
            },
            "negative_prompt": {
                "label": "Negative Prompt",
                "type": "string",
                "display": "textarea",
            },
            "lora_strength_clip": {
                "label": "LoRA Clip Strength",
                "type": "number",
                "default": 1.0,
                "min": 0.0,
                "max": 2.0,
                "step": 0.1,
                "display": "slider"
            },
            "lora_strength_model": {
                "label": "LoRA Model Strength",
                "type": "number",
                "default": 1.0,
                "min": 0.0,
                "max": 2.0,
                "step": 0.1,
                "display": "slider"
            },
            "images_per_prompt": {
                "label": "Animations Per Prompt",
                "type": "number",
                "default": 1,
                "min": 1,
                "max": 5,
                "display": "slider"
            },
            "media_out": {
                "label": "Animation",
                "type": "file",
                "display": "output",                
                "source": "media_out",
            }
        }
    }
}