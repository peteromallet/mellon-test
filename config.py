import configparser
import logging
import os

class Config:
    def __init__(self):
        self.config = configparser.ConfigParser()
        self.config.read('config.ini')

        self.server = {
            'host': self.config.get('server', 'host', fallback='127.0.0.1'),
            'port': self.config.getint('server', 'port', fallback=8080),
            'cors': self.config.getboolean('server', 'cors', fallback=False),
            'cors_route': self.config.get('server', 'cors_route', fallback='*'),
        }

        self.app = {
            'global_seed': self.config.getint('app', 'global_seed', fallback=42),
        }

        self.log = {
            'level': getattr(logging, self.config.get('logging', 'level', fallback='INFO').upper()),
        }

        self.hf = {
            'token': self.config.get('huggingface', 'token', fallback=None),
            'cache_dir': self.config.get('huggingface', 'cache_dir', fallback=None),
            'online_status': self.config.get('huggingface', 'online_status', fallback='Connect if needed'),
        }

        self.paths = {
            'data': self.config.get('paths', 'data', fallback='data'),
            'temp': self.config.get('paths', 'temp', fallback='data/temp'),
        }

        for path, value in self.paths.items():
            if not os.path.isabs(value):
                value = os.path.join(os.path.dirname(__file__), value)
                self.paths[path] = value

            if not os.path.exists(value):
                os.makedirs(value)

        self.environ = self.config['environ'] if 'environ' in self.config else {}
        for key, value in self.environ.items():
            self.environ[key] = self.config.get('environ', key, fallback=None)

config = Config()
