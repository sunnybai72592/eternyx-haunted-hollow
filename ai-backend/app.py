
from flask import Flask, request, jsonify
from flask_cors import CORS
from openai import OpenAI
import os

app = Flask(__name__)
CORS(app)  # Enable CORS for all origins

# Initialize OpenAI client
client = OpenAI()

@app.route("/chat", methods=["POST"])
def chat():
    data = request.json
    user_message = data.get("message")

    if not user_message:
        return jsonify({"error": "No message provided"}), 400

    try:
        # Call OpenAI API
        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": "You are the ETERNYX AI Security Assistant, a highly advanced AI designed to provide expert cybersecurity advice, threat analysis, and recommendations. Be concise, helpful, and always prioritize security best practices. Your responses should be professional and technical, reflecting the persona of a GPT-5 level AI.",
                },
                {
                    "role": "user",
                    "content": user_message,
                }
            ],
            model="gemini-2.5-flash", # Using the specified model
        )
        
        ai_response = chat_completion.choices[0].message.content
        return jsonify({"response": ai_response})

    except Exception as e:
        print(f"Error calling OpenAI API: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)

