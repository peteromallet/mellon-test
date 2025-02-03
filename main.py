import logging
import os
from config import config
import torch # warm up since we are going to use it anyway

# initialize logging
logging.basicConfig(level=config.log['level'], format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y%m%d %H.%M.%S")
logger = logging.getLogger('mellon')

# random seed generation
# import numpy as np
#import random
# torch.cuda.manual_seed(0)
# torch.cuda.manual_seed_all(0)
# torch.backends.cudnn.deterministic = True
# torch.backends.cudnn.benchmark = False
# np.random.seed(0)
# random.seed(0)
# os.environ['PYTHONHASHSEED'] = str(0)
# os.environ['CUBLAS_WORKSPACE_CONFIG'] = ':4096:8'
# torch.use_deterministic_algorithms(True)

# huggingface cache directory
if config.hf['cache_dir']:
    os.environ['HF_HOME'] = config.hf['cache_dir']

# load modules
from modules import MODULE_MAP

# start web server
from mellon.server import web_server #WebServer
#web_server = WebServer(MODULE_MAP, **config.server)

# welcome message
logger.info(f"""\x1b[33;20m
╔══════════════════════╗
║  Welcome to Mellon!  ║
╚══════════════════════╝\x1b[0m
Speak Friend and Enter: http://{config.server['host']}:{config.server['port']}""")

# Engage!
web_server.run()

