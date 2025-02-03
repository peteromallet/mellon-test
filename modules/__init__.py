from os import scandir
from importlib import import_module
import logging
logger = logging.getLogger('mellon')

logger.debug("Loading modules...")

MODULE_MAP = {}

for m in scandir("modules"):
    if m.is_dir() and not m.name.startswith(("__", ".")) and m.name not in globals():
        MODULE_MAP[m.name] = import_module(f"modules.{m.name}").MODULE_MAP
        logger.debug(f"Loaded module: {m.name}")

logger.debug("Loading custom modules...")

for m in scandir("custom"):
    if m.is_dir() and not m.name.startswith(("__", ".")) and m.name not in globals():
        MODULE_MAP[f"{m.name}.custom"] = import_module(f"custom.{m.name}").MODULE_MAP
        logger.debug(f"Loaded custom module: {m.name}")


# Add random helper fields
def create_random_field(param):
    return {
        f"__random__{param}": {
            'label': 'Enable Random Seed',
            'type': 'boolean',
            'display': 'iconToggle',
            'default': False,
            'group': f"random-{param}",
            'icon': 'random',
            'onChange': {'action': 'disable', 'target': { True: [param], False: [] }}
        }
    }

for module, actions in MODULE_MAP.items():
    for action, data in actions.items():
        if 'params' not in data:
            continue
            
        random_params = {
            param: field for param, field in data['params'].items()
            if 'display' in field and field['display'] == 'random'
        }
        
        for param, field in random_params.items():
            field['group'] = f"random-{param}"
            field['display'] = "number"

            # if 'onAfterNodeExecute' not in data:
            #     data['onAfterNodeExecute'] = []
            # elif not isinstance(data['onAfterNodeExecute'], list):
            #     data['onAfterNodeExecute'] = [data['onAfterNodeExecute']]

            # data['onAfterNodeExecute'].append({
            #     'action': 'updateValue',
            #     'target': param
            # })

            data['params'].update(create_random_field(param))
