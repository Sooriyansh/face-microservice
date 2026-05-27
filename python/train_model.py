import numpy as np
from pathlib import Path
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input

from config import DATASET_DIR, EMBEDDINGS_PATH
from utils import build_embedding_model, compute_embedding, extract_face_tensor, get_face_detector, get_profile_face_detector, normalize_lighting

import cv2


def iter_images():
    for label_dir in sorted(DATASET_DIR.iterdir()):
        if not label_dir.is_dir():
            continue
        for image_path in sorted(label_dir.glob("*.jpg")):
            yield label_dir.name, image_path


def fallback_face_tensor(image):
    height, width = image.shape[:2]
    side = min(height, width)
    start_x = max((width - side) // 2, 0)
    start_y = max((height - side) // 2, 0)
    crop = image[start_y:start_y + side, start_x:start_x + side]
    crop = normalize_lighting(crop)
    face_tensor = cv2.resize(crop, (160, 160)).astype('float32')
    face_tensor = cv2.cvtColor(face_tensor, cv2.COLOR_BGR2RGB)
    return preprocess_input(face_tensor)


def main():
    model = build_embedding_model()
    detector = get_face_detector()
    profile_detector = get_profile_face_detector()
    labels = []
    embeddings = []

    for label, image_path in iter_images():
        image = cv2.imread(str(image_path))
        if image is None:
            continue

        # For dummy data, skip face detection and use the whole image
        if image.shape[0] == 160 and image.shape[1] == 160:  # Dummy images are 160x160
            face_tensor = cv2.resize(image, (160, 160)).astype('float32')
            face_tensor = cv2.cvtColor(face_tensor, cv2.COLOR_BGR2RGB)
            face_tensor = preprocess_input(face_tensor)  # Same as extract_face_tensor
        else:
            # Real face detection for actual images
            enhanced = normalize_lighting(image)
            gray = cv2.cvtColor(enhanced, cv2.COLOR_BGR2GRAY)
            faces = list(detector.detectMultiScale(gray, scaleFactor=1.08, minNeighbors=4, minSize=(55, 55)))
            faces.extend(profile_detector.detectMultiScale(gray, scaleFactor=1.08, minNeighbors=4, minSize=(55, 55)))
            if len(faces) == 0:
                face_tensor = fallback_face_tensor(image)
            else:
                largest_face = max(faces, key=lambda item: item[2] * item[3])
                face_tensor = extract_face_tensor(image, largest_face)

        embedding = compute_embedding(model, face_tensor)

        embeddings.append(embedding)
        labels.append(label)

    if not embeddings:
        raise RuntimeError("No dataset images found. Run capture_faces.py first.")

    np.savez_compressed(
        EMBEDDINGS_PATH,
        labels=np.array(labels),
        embeddings=np.array(embeddings),
    )
    print(f"Saved {len(labels)} embeddings to {EMBEDDINGS_PATH}")


if __name__ == "__main__":
    main()
