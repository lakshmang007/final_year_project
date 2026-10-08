"""Folder-name -> label mapping used by ml/train.py. Run: ml/.venv/Scripts/python tests/test_label_mapping.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ml"))
from train import folder_fresh, folder_type  # noqa: E402

TYPES = {
    "Grapefruit Pink 1": None, "Grape White 2": "grapes", "Pineapple Mini 1": "pineapple", "pinenapple": "pineapple",
    "Apple Golden 1": "apple", "Potato Sweet 1": "sweet_potato", "sweetpotato": "sweet_potato", "Potato Red 1": "potato",
    "Pepper Orange 1": "bell_pepper", "chilli pepper": "chilli_pepper", "jalepeno": "chilli_pepper", "paprika": "bell_pepper",
    "capsicum": "bell_pepper", "sweetcorn": "corn", "Corn Husk 1": "corn", "soy beans": None, "Mangostan 1": None,
    "Mango Red 1": "mango", "Pepino 1": None, "Peach 1": None, "Peanut shell 1x 1": None, "Pear Monster 1": "pear",
    "raddish": "radish", "lettuce": "leafy_greens", "spinach": "leafy_greens", "Watermelon 1": "watermelon",
    "watermelon": "watermelon", "Lemon Meyer 1": "lemon", "Limes 1": "lime", "Orange peeled 1": "orange",
    "FreshBellpepper": "bell_pepper", "freshoranges": "orange", "Pomelo Sweetie 1": None, "Eggplant long 1": "eggplant",
    "Brinjal": "eggplant", "garlic bulb 1": "garlic", "Ginger Root 1": "ginger", "Onion White 1": "onion", "peas": "peas",
    "Cabbage red 1": "cabbage", "Kiwi 1": "kiwi", "Tomato Cherry Red 1": "tomato", "Cactus fruit 1": None,
    "Kohlrabi 1": None, "stawberries": "strawberry", "Pomegranate_Good": "pomegranate", "Bitter_Gourd": None,
}
FRESH = {"FreshApple": 1, "RottenBanana": 0, "freshoranges": 1, "Apple_Good": 1, "Lime_Bad": 0,
         "Mixed Qualit_Fruits": None, "Banana Red 1": None, "badminton": None}

bad = [(k, folder_type(k), v) for k, v in TYPES.items() if folder_type(k) != v]
bad += [(k, folder_fresh(k), v) for k, v in FRESH.items() if folder_fresh(k) != v]
print(f"{len(TYPES) + len(FRESH)} mappings checked, {len(bad)} wrong", *bad, sep="\n")
sys.exit(1 if bad else 0)
