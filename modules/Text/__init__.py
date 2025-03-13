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
                "source": "video_out",
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
            "files": {
                "label": "Files",
                "type": "text",
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
                "source": "gallery_out",
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
                "display": "textarea",
            },
            "prompt": {
                "label": "Prompt",
                "type": "string",
                "display": "textarea",
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
            "image_out": {
                "label": "Image",
                "type": "text",
                "display": "output",                
                "source": "image_out",
            }
        }
    }
}