import json
import os
import sys
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

import cv2
import numpy as np

from config import CONFIDENCE_MARGIN, CONFIDENCE_THRESHOLD, EMBEDDINGS_PATH
from utils import (
    build_embedding_model,
    compute_embedding,
    cosine_similarity,
    detect_largest_face,
    extract_face_tensor,
    get_face_detector,
    get_profile_face_detector,
    validate_face_quality,
)


def load_embeddings():
    if not EMBEDDINGS_PATH.exists():
        raise RuntimeError("Embeddings file not found. Run train_model.py first.")

    data = np.load(EMBEDDINGS_PATH, allow_pickle=True)
    return data["labels"], data["embeddings"]


def find_best_match(embedding, labels, embeddings):
    scores = np.array([cosine_similarity(embedding, stored) for stored in embeddings], dtype=np.float32)
    if len(scores) == 0:
        return None, 0.0, 0.0
    best_index = int(np.argmax(scores))
    best_label = str(labels[best_index])
    same_label_scores = scores[np.array([str(label) == best_label for label in labels])]
    other_scores = scores[np.array([str(label) != best_label for label in labels])]
    label_score = float(np.mean(np.sort(same_label_scores)[-min(3, len(same_label_scores)):]))
    runner_up = float(np.max(other_scores)) if len(other_scores) else 0.0
    return best_label, max(float(scores[best_index]), label_score), runner_up


def recognize_image(model, detector, profile_detector, labels, embeddings, image_path):
    image = cv2.imread(str(image_path))
    if image is None:
        raise RuntimeError("Unable to read image")

    face = detect_largest_face(image, detector, profile_detector)
    if face is None:
        return {
            "success": True,
            "matched": False,
            "stage": "no_face",
            "message": "No face detected. Center your face inside the scanner and move closer.",
            "guidance": "Center face"
        }

    quality = validate_face_quality(image, face)
    severe_quality_failure = quality["blur"]["blur_score"] < 18 or quality["brightness"]["brightness"] < 22 or quality["size"]["area_ratio"] < 0.012
    if severe_quality_failure:
        error_msg = " | ".join(quality["error_messages"]) if quality["error_messages"] else "Face quality is poor."
        return {
            "success": True,
            "matched": False,
            "stage": "quality_failed",
            "message": error_msg,
            "confidence": 0,
            "quality": quality,
            "quality_issues": quality["error_messages"],
            "box": {
                "x": int(face[0]),
                "y": int(face[1]),
                "w": int(face[2]),
                "h": int(face[3]),
            },
        }

    face_tensor = extract_face_tensor(image, face)
    embedding = compute_embedding(model, face_tensor)
    label, score, runner_up = find_best_match(embedding, labels, embeddings)
    margin = score - runner_up

    if not label or score < CONFIDENCE_THRESHOLD or margin < CONFIDENCE_MARGIN:
        return {
            "success": True,
            "matched": False,
            "stage": "low_confidence",
            "message": "Face detected, but identity confidence is low. Hold still, face the camera, and improve lighting.",
            "confidence": round(score, 4),
            "runnerUpConfidence": round(runner_up, 4),
            "margin": round(margin, 4),
            "quality": quality,
            "quality_issues": quality["error_messages"],
            "box": {
                "x": int(face[0]),
                "y": int(face[1]),
                "w": int(face[2]),
                "h": int(face[3]),
            },
        }

    return {
        "success": True,
        "matched": True,
        "label": label,
        "confidence": round(score, 4),
        "runnerUpConfidence": round(runner_up, 4),
        "margin": round(margin, 4),
        "quality": quality,
        "quality_issues": quality["error_messages"],
        "box": {
            "x": int(face[0]),
            "y": int(face[1]),
            "w": int(face[2]),
            "h": int(face[3]),
        },
    }


def emit(payload):
    print(json.dumps(make_json_safe(payload)), flush=True)


def make_json_safe(value):
    if isinstance(value, dict):
        return {str(key): make_json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [make_json_safe(item) for item in value]
    if isinstance(value, np.ndarray):
        return make_json_safe(value.tolist())
    if isinstance(value, np.generic):
        return value.item()
    return value


def main():
    try:
        model = build_embedding_model()
        detector = get_face_detector()
        profile_detector = get_profile_face_detector()
        labels, embeddings = load_embeddings()
        emit({"type": "ready"})
    except Exception as error:
        emit({"type": "fatal", "message": str(error)})
        return

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
            request_id = request["id"]
            image_path = Path(request["imagePath"])
            result = recognize_image(model, detector, profile_detector, labels, embeddings, image_path)
            emit({"type": "result", "id": request_id, "result": result})
        except Exception as error:
            emit(
                {
                    "type": "result",
                    "id": request.get("id") if "request" in locals() else None,
                    "result": {"success": False, "message": str(error)},
                }
            )


if __name__ == "__main__":
    main()
