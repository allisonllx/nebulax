import os
import pathlib

from app.models import Place, Text

BACKEND_DIR = pathlib.Path(__file__).resolve().parent.parent


def _load_dotenv():
    env_file = BACKEND_DIR / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


_load_dotenv()


def env(name: str) -> str | None:
    return os.environ.get(name) or None


# The demo journey's endpoints. Free-text geocoding arrives with the setup flow.
SAVED_PLACES = {
    "saved-home": Place(lat=1.3691, lon=103.8454, name=Text(en="Home", zh="家")),
    "ttsh-entrance": Place(lat=1.3214, lon=103.8459, name=Text(en="Tan Tock Seng Hospital", zh="陈笃生医院")),
}
