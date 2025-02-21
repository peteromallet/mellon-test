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
                "source": "timestamps",
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
            "timestamps": {
                "label": "Timestamps",
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
    }
}