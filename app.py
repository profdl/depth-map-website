from flask import Flask, request, render_template, jsonify, redirect, url_for
import os
import requests
import base64
from io import BytesIO
from PIL import Image
from dotenv import load_dotenv

# Load environment variables from the .env file
load_dotenv()

# Test if the API key is loaded
api_token = os.getenv("REPLICATE_API_TOKEN")
if not api_token:
    print("API key not set. Please check your .env file.")
else:
    print(f"API key is set: {api_token[:4]}...")  # This will print only the first few characters

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_image():
    try:
        if 'image' not in request.files:
            return jsonify({'error': 'No file part'}), 400
        file = request.files['image']
        if file.filename == '':
            return jsonify({'error': 'No selected file'}), 400

        img = Image.open(file)
        buffered = BytesIO()
        img.save(buffered, format="JPEG")
        img_base64 = base64.b64encode(buffered.getvalue()).decode()
        img_data_url = f"data:image/jpeg;base64,{img_base64}"

        api_token = os.getenv("REPLICATE_API_TOKEN")
        if not api_token:
            return jsonify({'error': 'API token not set'}), 500

        url = "https://api.replicate.com/v1/predictions"
        headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json"
        }
        data = {
            "version": "b239ea33cff32bb7abb5db39ffe9a09c14cbc2894331d1ef66fe096eed88ebd4",
            "input": {
                "image": img_data_url,
                "model_size": "Large"
            }
        }

        response = requests.post(url, json=data, headers=headers)

        if response.status_code != 201:
            return jsonify({'error': 'Model prediction failed', 'details': response.json()}), 500

        return jsonify({'message': 'Prediction started successfully', 'prediction_id': response.json()['id']})

    except Exception as e:
        print("An error occurred:", str(e))
        return jsonify({'error': 'Internal server error', 'details': str(e)}), 500

@app.route('/status/<prediction_id>', methods=['GET'])
def get_prediction_status(prediction_id):
    try:
        api_token = os.getenv("REPLICATE_API_TOKEN")
        url = f"https://api.replicate.com/v1/predictions/{prediction_id}"
        headers = {
            "Authorization": f"Bearer {api_token}"
        }

        response = requests.get(url, headers=headers)

        if response.status_code == 200:
            return jsonify(response.json())
        else:
            return jsonify({'error': 'Failed to get prediction status', 'details': response.json()}), 500

    except Exception as e:
        print("Error fetching prediction status:", str(e))
        return jsonify({'error': 'Internal server error', 'details': str(e)}), 500

@app.route('/result')
def result():
    return render_template('result.html')

@app.route('/error')
def error():
    return render_template('error.html')

if __name__ == '__main__':
    app.run(debug=True)
