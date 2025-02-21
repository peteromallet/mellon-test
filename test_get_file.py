import requests


def test_get_file():
    # Base URL for the local server; adjust if necessary
    base_url = "http://localhost:8080"
    image_filename = "qajj6ikbj_zu2po4vgf_Gi04OzIbcAAhUt0.jpeg"
    url = f"{base_url}/data/files/{image_filename}"
    
    print(f"Requesting URL: {url}")
    response = requests.get(url)
    
    if response.status_code == 200:
        content_type = response.headers.get("Content-Type")
        print(f"Content-Type: {content_type}")
        if response.content:
            output_filename = "downloaded_" + image_filename
            with open(output_filename, "wb") as f:
                f.write(response.content)
            print(f"Image saved as {output_filename}")
        else:
            print("No content received.")
    else:
        print(f"Failed to fetch file. HTTP status code: {response.status_code}")
        print(response.text)


if __name__ == "__main__":
    test_get_file() 