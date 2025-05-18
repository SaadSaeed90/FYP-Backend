from flask import Flask, request, jsonify
from flask_cors import CORS
import torch
from transformers import XLNetTokenizer, XLNetModel
import torch.nn as nn
from sklearn.preprocessing import LabelEncoder
import logging
import os

app = Flask(__name__)
CORS(app)

logging.basicConfig(level=logging.INFO)

model_path = '../../xlnet-8sources-3'
tokenizer = XLNetTokenizer.from_pretrained(model_path)

class CustomXLNetClassifier(nn.Module):
    def __init__(self, hidden_size=768, num_labels=6):
        super(CustomXLNetClassifier, self).__init__()
        self.xlnet = XLNetModel.from_pretrained(model_path)
        self.fc = nn.Linear(hidden_size, num_labels)

    def forward(self, input_ids, attention_mask):
        outputs = self.xlnet(input_ids=input_ids, attention_mask=attention_mask)
        last_hidden = outputs.last_hidden_state[:, -1, :]
        logits = self.fc(last_hidden)
        return logits

model = CustomXLNetClassifier(num_labels=6)
model_weights_path = os.path.join(model_path, "pytorch_model.bin")
model.load_state_dict(torch.load(model_weights_path, map_location=torch.device('cpu')))
model.eval()

severity_labels = ['Blocker', 'Critical', 'Major', 'Normal', 'Trivial', 'Minor']
label_encoder = LabelEncoder()
label_encoder.fit(severity_labels)

@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.get_json()
        if not data or 'text' not in data:
            logging.error("Invalid request payload.")
            return jsonify({'error': 'Invalid request. Please provide \"text\" field.'}), 400

        text = data['text']
        inputs = tokenizer(text, return_tensors='pt', truncation=True, padding=True, max_length=512)

        with torch.no_grad():
            logits = model(inputs['input_ids'], inputs['attention_mask'])
            probs = torch.nn.functional.softmax(logits, dim=1)
            predicted_class = torch.argmax(probs, dim=1).item()

        predicted_label = label_encoder.inverse_transform([predicted_class])[0]

        return jsonify({'prediction': predicted_label})

    except Exception as e:
        logging.error(f"Error during prediction: {e}", exc_info=True)
        return jsonify({'error': 'Internal server error. Check server logs for details.'}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
