import requests
import os
import mimetypes

def test_upload():
    url = 'http://localhost:8080/data/files'
    image_path = 'test.mp3'
    
    if not os.path.exists(image_path):
        return
    
    try:
        file_size = os.path.getsize(image_path)
        content_type, _ = mimetypes.guess_type(image_path)
        if not content_type:
            content_type = 'application/octet-stream'
        
        with open(image_path, 'rb') as file:
            files = {
                'file': (os.path.basename(image_path), file, content_type)
            }
            response = requests.post(url, files=files)
            
            if response.status_code == 200:
                verify_url = f"{url}/{response.text}"
                verify_response = requests.head(verify_url)
                if verify_response.status_code == 200:
                    content_length = verify_response.headers.get('content-length', '0')
                    return int(content_length) == file_size
            return False
            
    except Exception:
        return False

if __name__ == "__main__":
    test_upload() 