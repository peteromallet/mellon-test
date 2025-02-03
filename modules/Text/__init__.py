MODULE_MAP = {
    "Text": {
        "label": "Text",
        "description": "Text",
        "category": "text",
        "execution_type": "continuous",
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
    "Text2": {
        "label": "Text2",
        "description": "Text",
        "category": "text",        
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
            }
        }
    }
}