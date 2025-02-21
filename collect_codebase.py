import os
import fnmatch
import re
import argparse
import logging

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

def should_skip_file(filename, execution_only=False):
    # Hide any LICENSE file regardless of location
    if os.path.basename(filename).lower() in {"license", "license.txt", "license.md"}:
        return True
    
    # Root level files to skip
    root_level_skips = {
        'LICENSE',
        'LICENSE.txt',
        'LICENSE.md',
    }
    
    # If it's a root level file that should be skipped
    if os.path.dirname(filename) == '.' and os.path.basename(filename) in root_level_skips:
        return True

    # Skip patterns for files we don't want to include
    skip_patterns = [
        '*.min.js',      # Minified JavaScript
        '*.pyc',         # Python compiled files
        '*.pyo',         # Python optimized files
        '*.pyd',         # Python DLL files
        '*.so',          # Shared libraries
        '*.dll',         # DLL files
        '*.dylib',       # Dynamic libraries
        '*.class',       # Java compiled files
        '*.exe',         # Executables
        '*.o',           # Object files
        '*.a',           # Static libraries
        '*.lib',         # Library files
        '*.zip',         # Archives
        '*.tar',         # Archives
        '*.gz',          # Compressed files
        '*.rar',         # Compressed files
        '*.7z',          # Compressed files
        '*.map',         # Source map files
        'README*',       # README files
        'CHANGELOG*',    # Changelog files
        'requirements*.txt',  # Requirements files
        '*.svg',         # SVG files
        '*.png',         # Images
        '*.jpg',         # Images
        '*.jpeg',        # Images
        '*.gif',         # Images
        '*.ico',         # Icons
        '*.woff',        # Fonts
        '*.woff2',       # Fonts
        '*.ttf',         # Fonts
        '*.eot',         # Fonts
        '*.css',         # CSS files
        '*.scss',        # SCSS files
        '*.sass',        # SASS files
        '*.less',        # LESS files
        '*.json',        # JSON files
        'package-lock.json',  # NPM lock file
        'yarn.lock',     # Yarn lock file
        'pnpm-lock.yaml', # PNPM lock file
        'LICENSE*',      # License files
        'LICENCE*',      # Alternate spelling for license files
        '*.bundle.js',   # Bundled JavaScript files
        'compiled*.js',  # Compiled JavaScript files
        '**/PomsSimpleTimeline.tsx',  # Timeline component (match in any directory)
    ]
    
    # Skip files that look like build artifacts (containing hashes)
    if re.search(r'-[a-zA-Z0-9]{8,}\.', filename):
        return True

    if execution_only:
        # If execution_only is True, only include specific execution-related files and Text module
        execution_paths = [
            # Server-side paths
            os.path.join('mellon', 'server.py'),
            os.path.join('mellon', 'NodeBase.py'),
            os.path.join('modules', 'Text'),
            'main.py',
            'config.py',
            # Client-side paths
            os.path.join('client', 'src', 'App.*'),
            os.path.join('client', 'src', 'main.*'),
            os.path.join('client', 'src', 'components'),
            os.path.join('client', 'src', 'services'),
            os.path.join('client', 'src', 'utils'),
            os.path.join('client', 'src', 'hooks'),
            os.path.join('client', 'src', 'store'),
        ]
        
        # Check if the file is in the execution paths
        rel_path = os.path.relpath(filename)
        logger.debug(f"Checking if {rel_path} is an execution file")
        
        # Special handling for Text module directory
        if rel_path.startswith(os.path.join('modules', 'Text')):
            logger.debug(f"Found Text module file: {rel_path}")
            return False
            
        is_execution_file = any(
            fnmatch.fnmatch(rel_path, pattern) or
            rel_path.startswith(pattern)
            for pattern in execution_paths
        )
        
        if is_execution_file:
            logger.debug(f"Found execution file: {rel_path}")
        return not is_execution_file
        
    return any(fnmatch.fnmatch(filename.lower(), pattern.lower()) for pattern in skip_patterns)

def should_skip_directory(dirpath, execution_only=False):
    rel_path = os.path.relpath(dirpath)
    # If the directory is inside the modules folder, only allow 'Text' and 'BasicImage' subdirectories
    parts = rel_path.split(os.sep)
    if parts[0] == "modules" and len(parts) >= 2:
        if parts[1] not in ["Text", "BasicImage"]:
            logger.debug(f"Skipping module directory: {rel_path}")
            return True

    # Directories to skip
    skip_dirs = {
        'venv',
        'env',
        'node_modules',
        '__pycache__',
        '.git',
        '.idea',
        '.vscode',
        'site-packages',
        'dist',
        'build',
        'tests',
        'test',
        'docs',
        'examples',
        'assets',      # Web assets directory
        'static',      # Static files directory
        'public',      # Public assets
        'images',      # Image directories
        'img',         # Image directories
        'fonts',       # Font directories
        'css',         # CSS directories
        'scss',        # SCSS directories
        'styles',      # Style directories
        'data',        # Data directory to ignore
    }

    # If in execution mode, allow the 'Text' and 'BasicImage' modules explicitly
    if execution_only:
        if rel_path in [os.path.join('modules', 'Text'), os.path.join('modules', 'BasicImage')]:
            logger.debug(f"Not skipping module directory: {rel_path}")
            return False

    dir_name = os.path.basename(dirpath)
    return dir_name.lower() in skip_dirs

def is_node_related_file(filepath):
    rel_path = os.path.relpath(filepath)
    allowed_patterns = [
        "mellon/NodeBase.py",
        "mellon/server.py",
        "modules/Text/*",
        "main.py",
        "config.py",
        "client/src/App*",
        "client/src/main*",
        "client/src/components/*",
        "client/src/services/*",
        "client/src/store/*"
    ]
    for pattern in allowed_patterns:
        if fnmatch.fnmatch(rel_path, pattern):
            return True
    return False

def collect_code(start_path='.', execution_only=False, nodes=False):
    # Convert to absolute path
    abs_start_path = os.path.abspath(start_path)
    logger.info(f"Starting code collection from: {abs_start_path}")
    logger.info(f"Execution only mode: {execution_only}")
    logger.info(f"Nodes mode: {nodes}")
    
    with open('codebase.txt', 'w', encoding='utf-8') as outfile:
        for root, dirs, files in os.walk(abs_start_path):
            # Remove directories we want to skip
            dirs[:] = [d for d in dirs if not should_skip_directory(os.path.join(root, d), execution_only) and not d.startswith('.')]
            
            for file in sorted(files):
                if file.startswith('.'):
                    continue
                    
                filepath = os.path.join(root, file)
                
                if should_skip_file(filepath, execution_only):
                    continue
                
                # If nodes mode is enabled, only include node related files
                if nodes and (not is_node_related_file(filepath)):
                    continue

                logger.info(f"Including file: {os.path.relpath(filepath)}")
                
                try:
                    with open(filepath, 'r', encoding='utf-8') as infile:
                        content = infile.read()
                        
                    # Write file path with clear demarcation
                    outfile.write('\n' + '=' * 80 + '\n')
                    outfile.write(f'FILE: {os.path.relpath(filepath)}\n')
                    outfile.write('=' * 80 + '\n\n')
                    outfile.write(content)
                    outfile.write('\n')
                except (UnicodeDecodeError, IOError) as e:
                    # Skip binary files or files that can't be read as text
                    logger.warning(f"Could not read file {filepath}: {str(e)}")
                    continue

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Collect code from the codebase.')
    parser.add_argument('--execution', action='store_true', help='Only collect execution-related files and Text module')
    parser.add_argument('--nodes', action='store_true', help='Only collect files relevant to capturing, funneling, and displaying nodes')
    args = parser.parse_args()
    
    collect_code(execution_only=args.execution, nodes=args.nodes) 