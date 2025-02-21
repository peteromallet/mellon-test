import logging
logger = logging.getLogger('mellon')
from aiohttp import web, WSMsgType
from aiohttp_cors import setup as cors_setup, ResourceOptions
import json
import nanoid
import io
import base64
import re
from importlib import import_module
import asyncio
import traceback
from utils.memory_manager import memory_flush
from copy import deepcopy
import random
import signal
import time
import os
import gc
from pathlib import Path
import tempfile

def are_different(old_output, new_output):
    """Compare two outputs to determine if they are different."""
    if old_output is None or new_output is None:
        return old_output is not new_output
    if isinstance(old_output, dict) and isinstance(new_output, dict):
        if old_output.keys() != new_output.keys():
            return True
        return any(are_different(old_output[k], new_output[k]) for k in old_output)
    if isinstance(old_output, (list, tuple)) and isinstance(new_output, (list, tuple)):
        if len(old_output) != len(new_output):
            return True
        return any(are_different(o, n) for o, n in zip(old_output, new_output))
    return old_output != new_output

class WebServer:
    def __init__(
        self, 
        module_map: dict, 
        host: str = "0.0.0.0", 
        port: int = 8080, 
        cors: bool = False, 
        cors_route: str = "*"
    ):
        self.module_map = module_map
        self.node_store = {}
        self.queue = asyncio.Queue()
        self.queue_task = None
        self.host = host
        self.port = port
        self.ws_clients = {}
        self.app = web.Application()
        self.event_loop = None

        self.client_queue = asyncio.Queue()
        self.client_task = None

        self.app.add_routes([
            web.get('/', self.index),
            web.get('/nodes', self.nodes),
            web.get('/view/{format}/{node}/{key}/{index}', self.view),
            web.get('/view/{format}/{node}/{key}', self.view),
            web.get('/custom_component/{module}/{component}', self.custom_component),
            web.get('/custom_assets/{module}/{file_path}', self.custom_assets),
            web.get('/files', self.list_files),
            web.post('/data/files', self.upload_file),
            web.get('/data/files/{filename}', self.get_file),
            web.delete('/data/files/{filename}', self.delete_file),
            web.post('/graph', self.graph),
            web.post('/nodeExecute', self.node_execute),
            web.delete('/clearNodeCache', self.clear_node_cache),
            web.static('/assets', 'web/assets'),
            web.get('/favicon.ico', self.favicon),
            web.get('/ws', self.websocket_handler)
        ])

        if cors:
            cors = cors_setup(self.app, defaults={
                cors_route: ResourceOptions(
                    allow_credentials=True,
                    expose_headers="*",
                    allow_headers="*",
                )
            })
            for route in list(self.app.router.routes()):
                cors.add(route)

    def run(self):
        async def shutdown():
            if hasattr(self, 'is_shutting_down') and self.is_shutting_down:
                return
            self.is_shutting_down = True
            
            logger.info("Received shutdown signal. Namárië!")
            self.shutdown_event.set()

            # Cancel all running tasks except the current one
            tasks = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
            for task in tasks:
                task.cancel()

            await asyncio.gather(*tasks, return_exceptions=True)

            # Close all websocket connections
            for ws in list(self.ws_clients.values()):
                try:
                    await ws.close(code=1000, message=b'Server shutting down')
                except Exception:
                    pass  # Ignore any websocket closing errors
            self.ws_clients.clear()

        async def start_app():
            self.shutdown_event = asyncio.Event()
            self.event_loop = asyncio.get_event_loop()
            self.is_shutting_down = False

            # Set up signal handlers
            def signal_handler():
                if not self.is_shutting_down:
                    asyncio.create_task(shutdown())

            try:
                for sig in (signal.SIGINT, signal.SIGTERM):
                    self.event_loop.add_signal_handler(sig, signal_handler)
            except NotImplementedError:
                # For Windows compatibility
                pass

            runner = web.AppRunner(self.app, client_max_size=1024**4)
            await runner.setup()
            site = web.TCPSite(runner, self.host, self.port)

            # Start background tasks
            self.queue_task = asyncio.create_task(self.process_queue())
            self.client_task = asyncio.create_task(self.process_client_messages())

            await site.start()

            try:
                await self.shutdown_event.wait()
            finally:
                await shutdown()
                await runner.cleanup()

        try:
            asyncio.run(start_app())
        except KeyboardInterrupt:
            pass
        except asyncio.CancelledError:
            pass

    async def process_client_messages(self):
        while True:
            message = await self.client_queue.get()
            try:
                await self.ws_clients[message["client_id"]].send_json(message["data"])
            except Exception as e:
                logger.error(f"Error sending client message: {str(e)}")
            finally:
                self.client_queue.task_done()

    async def process_queue(self):
        while True:
            item = await self.queue.get()
            try:
                if "kwargs" in item:
                    await self.node_execute_single(item)
                else:
                    await self.graph_execution(item)
            except Exception as e:
                logger.error(f"Error processing queue task: {str(e)}")
                logger.error(f"Error occurred in {traceback.format_exc()}")
                await self.broadcast({
                    "type": "error",
                    "error": "An unexpected error occurred while processing the graph"
                })
            finally:
                self.queue.task_done()

    async def index(self, request):
        response = web.FileResponse('web/index.html')
        response.headers["Cache-Control"] = "no-cache"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response

    async def favicon(self, request):
        return web.FileResponse('web/favicon.ico')

    """
    HTTP API
    """

    async def custom_component(self, request):
        module = request.match_info.get('module')
        component = request.match_info.get('component')

        path = component.split('/')
        if len(path) > 1:
            module = path[0]
            component = path[1]

        response = web.FileResponse(f'custom/{module}/web/{component}.js')
        response.headers["Content-Type"] = "application/javascript"
        response.headers["Cache-Control"] = "no-cache"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response

    async def custom_assets(self, request):
        module = request.match_info.get('module')
        file_path = request.match_info.get('file_path')
        return web.FileResponse(f'custom/{module}/web/assets/{file_path}')

    async def nodes(self, request):
        from copy import deepcopy
        nodes = {}
        for module_name, actions in self.module_map.items():
            for action_name, action in actions.items():
                params = {}
                groups = {}
                if 'params' in action:
                    params = deepcopy(action['params'])
                    for p in params:
                        if 'postProcess' in params[p]:
                            del params[p]['postProcess']

                nodes[f"{module_name}-{action_name}"] = {
                    "label": action.get('label', f"{module_name}: {action_name}"),
                    "module": module_name,
                    "action": action_name,
                    "category": self.slugify(action.get('category', 'default')),
                    "execution_type": action.get('execution_type', 'workflow'),
                    "params": params,
                    "groups": groups,
                }
                if 'style' in action:
                    nodes[f"{module_name}-{action_name}"]["style"] = action['style']
                if 'resizable' in action:
                    nodes[f"{module_name}-{action_name}"]["resizable"] = action['resizable']
                if 'type' in action:
                    nodes[f"{module_name}-{action_name}"]["type"] = action['type']

        return web.json_response(nodes)
    
    async def view(self, request):
        allowed_formats = ['webp', 'png', 'jpeg', 'glb', 'text']

        format = request.match_info.get('format', 'webp').lower()
        if format not in allowed_formats:
            raise web.HTTPNotFound(text=f"Invalid format: {format}")

        nodeId = request.match_info.get('node')
        key = request.match_info.get('key')
        node = self.node_store.get(nodeId)

        if node is None:
            raise web.HTTPNotFound(text=f"Node {nodeId} not found")
        if key not in node.output:
            raise web.HTTPNotFound(text=f"Key {key} not found in node {nodeId}")   
        
        value = node.output[key]
        if value is None:
            raise web.HTTPNotFound(text=f"No data found for {key}")
        
        if not isinstance(value, list):
            value = [value]

        index = int(request.match_info.get("index", 0))
        if index < 0 or index >= len(value):
            raise web.HTTPNotFound(text=f"Index {index} out of bounds for {key}")
        
        # get additional request parameters
        quality = int(request.rel_url.query.get("quality", 100))
        quality = max(0, min(100, quality))
        scale = float(request.rel_url.query.get("scale", 1))
        scale = max(0.01, min(2, scale))
        filename = request.rel_url.query.get("filename", f"{key}_{index}.{format}")

        value = value[index]
        if scale != 1:
            from PIL.Image import Resampling
            width = int(value.width * scale)
            height = int(value.height * scale)
            value = value.resize((max(width, 1), max(height, 1)), resample=Resampling.BICUBIC)

        if format in ["webp","png","jpeg"]:
            byte_arr = io.BytesIO()
            value.save(byte_arr, format=format.upper(), quality=quality)
            byte_arr = byte_arr.getvalue()
            return web.Response(
                body=byte_arr,
                content_type="image/webp",
                headers={
                    "Content-Disposition": f"inline; filename={filename}",
                    "Content-Length": str(len(byte_arr)),
                    "Cache-Control": "max-age=31536000, immutable",
                }
            )
        elif format == "glb":
            byte_arr = io.BytesIO()
            byte_arr.write(value)
            byte_arr = byte_arr.getvalue()
            return web.Response(
                body=byte_arr,
                content_type="model/glb",
                headers={
                    "Content-Disposition": f"inline; filename={key}.glb",
                    "Content-Length": str(len(byte_arr)),
                    "Cache-Control": "max-age=31536000, immutable",
                }
            )
        elif format == "text":
            return web.json_response({ "data": value })

    async def clear_node_cache(self, request):
        data = await request.json()
        nodeId = []

        if "nodeId" in data:
            nodeId = data["nodeId"] if isinstance(data["nodeId"], list) else [data["nodeId"]]
        else:
            nodeId = list(self.node_store.keys())

        for n in nodeId:
            if n in self.node_store:
                self.node_store[n] = None
                del self.node_store[n]

        memory_flush(gc_collect=True)

        return web.json_response({
            "type": "cacheCleared",
            "nodeId": nodeId
        })

    async def graph(self, request):
        graph = await request.json()
        await self.queue.put(graph)
        return web.json_response({
            "type": "graphQueued",
            "sid": graph["sid"]
        })

    async def node_execute(self, request):
        data = await request.json()
        await self.queue.put(data)
        return web.json_response({
            "type": "nodeQueued",
            "sid": data["sid"],
        })

    async def node_execute_single(self, data):
        sid = data["sid"]
        module = data["module"]
        action = data["action"]
        kwargs = data["kwargs"]
        node = data["node"]

        if module not in self.module_map:
            raise ValueError("Invalid module")
        if action not in self.module_map[module]:
            raise ValueError("Invalid action")

        if module.endswith(".custom"):
            module = import_module(f"custom.{module.replace('.custom', '')}.{module.replace('.custom', '')}")
        else:
            module = import_module(f"modules.{module}.{module}")
        action = getattr(module, action)

        if not callable(action):
            raise ValueError("Action is not callable")

        node = action()
        node._client_id = sid

        result = {}

        try:
            result = await self.event_loop.run_in_executor(None, lambda: node(**kwargs))
        except Exception as e:
            logger.error(f"Error executing node {module}.{action}: {str(e)}")
            raise e

        await self.client_queue.put({
            "client_id": sid,
            "data": {
                "type": "single_executed",
                "nodeId": node,
                "module": module,
                "action": action,
                "result": result,
            }
        })

    async def graph_execution(self, graph):
        sid = graph["sid"]
        nodes = graph["nodes"]
        paths = graph["paths"]
        
        print(f"\n=== Starting graph execution with SID: {sid} ===")
        print(f"Number of nodes: {len(nodes)}")
        print(f"Number of paths: {len(paths)}")

        randomized_fields = {}
        for path_index, path in enumerate(paths):
            print(f"\n--- Processing path {path_index + 1}/{len(paths)} ---")
            for node in path:
                module_name = nodes[node]["module"]
                action_name = nodes[node]["action"]
                print(f"\nExecuting node: {node}")
                print(f"Module: {module_name}, Action: {action_name}")
                logger.debug(f"Executing node {module_name}.{action_name}")

                old_output = deepcopy(self.node_store[node].output) if node in self.node_store else None
                print(f"Previous output exists: {old_output is not None}")

                params = nodes[node]["params"]
                print(f"Parameters: {params}")
                ui_fields = {}
                args = {}
                for p in params:
                    source_id = params[p].get("sourceId")
                    source_key = params[p].get("sourceKey")
                    print(f"\nProcessing parameter: {p}")
                    print(f"Source ID: {source_id}, Source Key: {source_key}")

                    # Adjusted logic to handle "ui_video" or "ui"
                    if ("display" in params[p] and params[p]["display"] in ("ui", "ui_video")) or p.startswith("ui_"):
                        print(f"UI field detected: {p} with type {params[p]['type']}")
                        if params[p]["type"] in ("image", "3d", "text", "video"):
                            ui_fields[p] = { "source": source_key, "type": params[p]["type"] }
                    else:
                        if source_id and re.match(r".*\[\d+\]$", p):
                            print(f"List field detected: {p}")
                            spawn_key = re.sub(r"\[\d+\]$", "", p)
                            if not args.get(spawn_key):
                                args[spawn_key] = []
                            elif not isinstance(args[spawn_key], list):
                                args[spawn_key] = [args[spawn_key]]
                            args[spawn_key].append(self.node_store[source_id].output[source_key])
                        else:
                            args[p] = (
                                self.node_store[source_id].output[source_key]
                                if source_id
                                else params[p].get("value")
                            )
                            print(f"Regular field: {p} = {args[p]}")

                print(f"\nFinal arguments for node execution: {args}")
                print(f"UI fields to update: {ui_fields}")

                # Randomization
                for key in args:
                    if key.startswith('__random__') and args[key] is True:
                        print(f"\nRandomizing field: {key}")
                        if node not in randomized_fields:
                            randomized_fields[node] = []
                        if key in randomized_fields[node]:
                            print(f"Field {key} already randomized, skipping")
                            continue
                        randomized_fields[node].append(key)
                        random_field = key.split('__random__')[1]
                        args[random_field] = random.randint(0, (1<<53)-1)
                        params[random_field]["value"] = args[random_field]
                        print(f"New random value for {random_field}: {args[random_field]}")
                        await self.client_queue.put({
                            "client_id": sid,
                            "data": {
                                "type": "updateValues",
                                "nodeId": node,
                                "key": random_field,
                                "value": args[random_field]
                            }
                        })

                if module_name not in self.module_map:
                    raise ValueError("Invalid module")
                if action_name not in self.module_map[module_name]:
                    raise ValueError("Invalid action")

                if module_name.endswith(".custom"):
                    print(f"\nImporting custom module: {module_name}")
                    mod = import_module(f"custom.{module_name.replace('.custom', '')}.{module_name.replace('.custom', '')}")
                else:
                    print(f"\nImporting standard module: {module_name}")
                    mod = import_module(f"modules.{module_name}.{module_name}")
                action = getattr(mod, action_name)

                if node not in self.node_store:
                    print(f"Initializing new node in store: {node}")
                    self.node_store[node] = action(node)

                self.node_store[node]._client_id = sid
                if not callable(self.node_store[node]):
                    raise TypeError(
                        f"The class `{module_name}.{action_name}` is not callable. "
                        f"Ensure that the class has a __call__ method or extend it from `NodeBase`."
                    )

                print("\nStarting node execution...")
                await self.client_queue.put({
                    "client_id": sid,
                    "data": {
                        "type": "progress",
                        "nodeId": node,
                        "progress": -1
                    }
                })

                try:
                    def execute_node():
                        try:
                            return self.node_store[node](**args)
                        except StopIteration:
                            return None

                    result = await self.event_loop.run_in_executor(None, execute_node)
                    print(f"Node execution completed with result type: {type(result)}")
                except Exception as e:
                    print(f"Error executing node: {str(e)}")
                    logger.error(f"Error executing node {module_name}.{action_name}: {str(e)}")
                    raise e

                exec_type = self.module_map[module_name][action_name].get("execution_type", "workflow")
                print(f"\nExecution type: {exec_type}")
                new_output = self.node_store[node].output

                if exec_type == "continuous":
                    if not are_different(old_output, new_output):
                        print("Output unchanged, skipping updates")
                        logger.debug(f"Skipping updates for node {node} - output unchanged")
                        execution_time = getattr(self.node_store[node], '_execution_time', 0)
                        await self.client_queue.put({
                            "client_id": sid,
                            "data": {
                                "type": "executed",
                                "nodeId": node,
                                "time": f"{execution_time:.2f}",
                            }
                        })
                        continue

                execution_time = getattr(self.node_store[node], '_execution_time', 0)
                print(f"Execution time: {execution_time:.2f}s")

                await self.client_queue.put({
                    "client_id": sid,
                    "data": {
                        "type": "executed",
                        "nodeId": node,
                        "time": f"{execution_time:.2f}",
                    }
                })
                logger.debug(f"Node {module_name}.{action_name} executed in {execution_time:.3f}s")

                # Decide format based on node's type
                for key in ui_fields:
                    print(f"\nProcessing UI field: {key}")
                    source = ui_fields[key]["source"]
                    source_value = self.node_store[node].output[source]
                    param_type = ui_fields[key]["type"].lower()

                    length = len(source_value) if isinstance(source_value, list) else 1
                    if param_type == "image":
                        format = 'webp'
                    elif param_type == "3d":
                        format = 'glb'
                    elif param_type == "video":
                        format = 'mp4'
                    else:
                        format = 'text'

                    print(f"Param type is '{param_type}', so using format='{format}'.  length={length}")

                    data = None

                    if format == 'text':
                        data = {
                            "url": f"/view/{format}/{node}/{source}/{0}?t={time.time()}",
                            "value": source_value
                        }

                    elif format == 'mp4':
                        data = {
                            "value": f"/view/{format}/{node}/{source}/{0}?t={time.time()}"
                        }

                    elif format == 'webp':
                        data = []
                        if not isinstance(source_value, list):
                            source_value = [source_value]
                        for i, val in enumerate(source_value):
                            scale = 1
                            if val.width > 1024 or val.height > 1024:
                                scale = 0.5
                            url = f"/view/{format}/{node}/{source}/{i}?scale={scale}&t={time.time()}"
                            data.append({
                                "url": url,
                                "width": val.width,
                                "height": val.height
                            })

                    elif format == 'glb':
                        data = []
                        if not isinstance(source_value, list):
                            source_value = [source_value]
                        for i, val in enumerate(source_value):
                            url = f"/view/{format}/{node}/{source}/{i}?t={time.time()}"
                            data.append({"url": url})

                    print(f"Sending UI update for {key} => data={data}")
                    await self.client_queue.put({
                        "client_id": sid,
                        "data": {
                            "type": param_type,
                            "key": key,
                            "nodeId": node,
                            "data": data
                        }
                    })

                await asyncio.sleep(0)
                print(f"\n=== Completed node {node} ===")

        print("\n=== Graph execution completed ===")

    async def list_files(self, request):
        path = request.query.get('path', '')
        if not path:
            path = os.path.join('data', 'files')
        
        os.makedirs(path, exist_ok=True)

        try:
            requested_path = Path(path).resolve()
            base_path = Path('data/files').resolve()
            if not str(requested_path).startswith(str(base_path)) and path != 'data/files':
                raise web.HTTPForbidden(text="Access to this directory is not allowed")
        except (ValueError, RuntimeError):
            raise web.HTTPBadRequest(text="Invalid path")

        try:
            entries = []
            with os.scandir(path) as it:
                for entry in it:
                    entries.append({
                        'name': entry.name,
                        'isDirectory': entry.is_dir(),
                        'path': os.path.join(path, entry.name).replace('\\', '/')
                    })
            entries.sort(key=lambda x: (not x['isDirectory'], x['name'].lower()))
            return web.json_response({
                'files': entries,
                'currentPath': path.replace('\\', '/')
            })
        except Exception as e:
            raise web.HTTPInternalServerError(text=str(e))

    async def upload_file(self, request):
        temp_file = None
        try:
            reader = await request.multipart()
            file_field = await reader.next()
            if file_field is None or file_field.name != 'file':
                raise web.HTTPBadRequest(text="No valid file provided")
            
            filename = file_field.filename
            if not filename:
                raise web.HTTPBadRequest(text="No filename provided")
            
            save_path = os.path.join(os.getcwd(), 'data', 'files')
            os.makedirs(save_path, exist_ok=True)
            
            fd, temp_path = tempfile.mkstemp(dir=save_path)
            temp_file = os.fdopen(fd, 'wb')
            
            size = 0
            try:
                while True:
                    chunk = await file_field.read_chunk(size=8*1024*1024)
                    if not chunk:
                        break
                    size += len(chunk)
                    temp_file.write(chunk)
                    if size % (64*1024*1024) == 0:
                        temp_file.flush()
                        os.fsync(temp_file.fileno())
                temp_file.flush()
                os.fsync(temp_file.fileno())
            finally:
                temp_file.close()
            
            custom_filename = None
            next_field = await reader.next()
            if next_field and next_field.name == 'filename':
                custom_filename = await next_field.text()
            
            base_filename = custom_filename or filename
            original_name, original_ext = os.path.splitext(filename)
            
            if custom_filename:
                custom_name, custom_ext = os.path.splitext(custom_filename)
                if not custom_ext:
                    base_filename = custom_name + original_ext
            
            counter = 1
            final_filename = base_filename
            while os.path.exists(os.path.join(save_path, final_filename)):
                name, ext = os.path.splitext(base_filename)
                final_filename = f"{name}_{counter}{ext}"
                counter += 1
            
            final_path = os.path.join(save_path, final_filename)
            os.rename(temp_path, final_path)
            
            return web.Response(text=final_filename)
        except Exception as e:
            if temp_file:
                temp_file.close()
                if os.path.exists(temp_path):
                    try:
                        os.remove(temp_path)
                    except Exception:
                        pass
            raise web.HTTPInternalServerError(text=str(e))

    async def get_file(self, request):
        try:
            filename = request.match_info['filename']
            file_path = os.path.join(os.getcwd(), 'data', 'files', filename)
            
            logger.info(f"Attempting to serve file: {file_path}")
            
            if not os.path.exists(file_path):
                logger.error(f"File not found: {file_path}")
                raise web.HTTPNotFound(text=f"File not found: {filename}")
            
            if not os.access(file_path, os.R_OK):
                logger.error(f"File not readable: {file_path}")
                raise web.HTTPForbidden(text=f"File not readable: {filename}")
                
            file_size = os.path.getsize(file_path)
            logger.info(f"File exists and is readable. Size: {file_size} bytes")

            if filename.lower().endswith('.mp4'):
                with open(file_path, 'rb') as f:
                    data = f.read()
                response = web.Response(
                    body=data,
                    content_type='video/mp4',
                    headers={
                        "Content-Length": str(file_size),
                        "Accept-Ranges": "bytes",
                        "Cache-Control": "no-cache, no-store, must-revalidate",
                        "Pragma": "no-cache",
                        "Expires": "0"
                    }
                )
                logger.info("Serving MP4 file directly")
                return response
            
            response = web.FileResponse(file_path)
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
            response.headers["Content-Length"] = str(file_size)
            
            logger.info(f"Serving file with headers: {dict(response.headers)}")
            return response
            
        except web.HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error serving file: {str(e)}")
            raise web.HTTPInternalServerError(text=str(e))

    async def delete_file(self, request):
        try:
            filename = request.match_info['filename']
            file_path = os.path.join(os.getcwd(), 'data', 'files', filename)
            
            if not os.path.exists(file_path):
                raise web.HTTPNotFound(text=f"File not found: {filename}")
            
            os.remove(file_path)
            return web.Response(text=f"File {filename} deleted successfully")
        except web.HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error deleting file: {str(e)}")
            raise web.HTTPInternalServerError(text=str(e))

    """
    WebSocket API
    """
    async def websocket_handler(self, request):
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        sid = request.query.get("sid")
        logger.info(f"WebSocket connection with sid {sid}")
        if sid:
            if sid in self.ws_clients:
                del self.ws_clients[sid]
        else:
            sid = nanoid.generate(size=10)

        self.ws_clients[sid] = ws
        await ws.send_json({"type": "welcome", "sid": sid})

        async for msg in ws:
            if msg.type == WSMsgType.TEXT:
                data = json.loads(msg.data)
                try:
                    if data["type"] == "ping":
                        await ws.send_json({"type": "pong"})
                    elif data["type"] == "close":
                        await ws.close()
                        break
                    else:
                        raise ValueError("Invalid message type")
                except Exception as e:
                    logger.error(f"Unexpected error: {str(e)}")
                    await ws.send_json({"type": "error", "message": "An unexpected error occurred"})
            elif msg.type == WSMsgType.ERROR:
                logger.error(f'WebSocket connection closed with exception {ws.exception()}')

        del self.ws_clients[sid]
        logger.info(f'WebSocket connection {sid} closed')
        return ws

    async def broadcast(self, message, client_id=None):
        if client_id:
            if client_id not in self.ws_clients:
                return
            ws_clients = [client_id] if not isinstance(client_id, list) else client_id
        else:
            ws_clients = self.ws_clients

        for client in ws_clients:
            await self.ws_clients[client].send_json(message)

    def to_base64(self, type, value):
        if type == "image":
            img_byte_arr = io.BytesIO()
            value.save(img_byte_arr, format='WEBP', quality=100)
            img_byte_arr = img_byte_arr.getvalue()
            return base64.b64encode(img_byte_arr).decode('utf-8')
        elif type == "3d":
            glb_byte_arr = io.BytesIO()
            glb_byte_arr.write(value)
            glb_byte_arr = glb_byte_arr.getvalue()
            return base64.b64encode(glb_byte_arr).decode('utf-8')

    def slugify(self, text):
        return re.sub(r'[^\w\s-]', '', text).strip().replace(' ', '-')


from modules import MODULE_MAP
from config import config

web_server = WebServer(MODULE_MAP, **config.server)
