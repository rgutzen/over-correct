"""
Algorithmic chaos engine for negative dial values.

dial = 0    → no-op
dial = -1   → subtle: occasional wrong adjacent keys, transpositions
dial = -3   → moderate: dropped letters, doubled letters, homophone swaps
dial = -5   → heavy: word-level scrambling, syllable shuffles
dial = -10  → nuclear: character soup
"""

import random
import string

# QWERTY adjacency map for realistic typo simulation. TODO: extend to more keys
ADJACENT_KEYS: dict[str, str] = {
    "q": "wa",
    "w": "qase",
    "e": "wsdr",
    "r": "edft",
    "t": "rfgy",
    "y": "tghu",
    "u": "yhji",
    "i": "ujko",
    "o": "iklp",
    "p": "ol",
    "a": "qwsz",
    "s": "awedxz",
    "d": "serfcx",
    "f": "drtgvc",
    "g": "ftyhbv",
    "h": "gyujnb",
    "j": "huikmn",
    "k": "jiolm",
    "l": "kop",
    "z": "asx",
    "x": "zsdc",
    "c": "xdfv",
    "v": "cfgb",
    "b": "vghn",
    "n": "bhjm",
    "m": "njk",
}

# TODO: expand with more homophones, contractions, common misspellings
HOMOPHONES: dict[str, str] = {
    "their": "there",
    "there": "their",
    "they're": "their",
    "your": "you're",
    "you're": "your",
    "its": "it's",
    "it's": "its",
    "to": "too",
    "too": "to",
    "two": "to",
    "then": "than",
    "than": "then",
    "affect": "effect",
    "effect": "affect",
    "here": "hear",
    "hear": "here",
    "where": "wear",
    "wear": "where",
    "right": "write",
    "write": "right",
    "new": "knew",
    "knew": "new",
    "meet": "meat",
    "meat": "meet",
    "see": "sea",
    "sea": "see",
    "for": "four",
    "four": "for",
    "by": "buy",
    "buy": "by",
    "be": "bee",
    "bee": "be",
    "no": "know",
    "know": "no",
}


def _adjacent_key(ch: str) -> str:
    lower = ch.lower()
    neighbors = ADJACENT_KEYS.get(lower, lower)
    replacement = random.choice(neighbors)
    return replacement.upper() if ch.isupper() else replacement


def _apply_to_chars(text: str, prob: float, fn) -> str:
    return "".join(
        fn(ch) if ch.isalpha() and random.random() < prob else ch for ch in text
    )


def _transpose(text: str, prob: float) -> str:
    chars = list(text)
    for i in range(len(chars) - 1):
        if chars[i].isalpha() and chars[i + 1].isalpha() and random.random() < prob:
            chars[i], chars[i + 1] = chars[i + 1], chars[i]
    return "".join(chars)


def _drop_char(text: str, prob: float) -> str:
    return "".join(ch for ch in text if not (ch.isalpha() and random.random() < prob))


def _double_char(text: str, prob: float) -> str:
    result = []
    for ch in text:
        result.append(ch)
        if ch.isalpha() and random.random() < prob:
            result.append(ch)
    return "".join(result)


def _homophone_swap(text: str, prob: float) -> str:
    words = text.split(" ")
    result = []
    for word in words:
        lower = word.lower()
        if lower in HOMOPHONES and random.random() < prob:
            replacement = HOMOPHONES[lower]
            # preserve rough capitalization
            if word[0].isupper():
                replacement = replacement.capitalize()
            result.append(replacement)
        else:
            result.append(word)
    return " ".join(result)


def _scramble_word_internals(text: str, prob: float) -> str:
    """Scramble interior letters of words (keep first/last)."""

    def scramble(word: str) -> str:
        if len(word) <= 3 or random.random() >= prob:
            return word
        interior = list(word[1:-1])
        random.shuffle(interior)
        return word[0] + "".join(interior) + word[-1]

    words = text.split(" ")
    return " ".join(scramble(w) for w in words)


def _random_case(text: str, prob: float) -> str:
    return "".join(
        ch.upper() if ch.isalpha() and random.random() < prob else ch for ch in text
    )


def _inject_random_chars(text: str, prob: float) -> str:
    result = []
    for ch in text:
        result.append(ch)
        if random.random() < prob:
            result.append(random.choice(string.ascii_lowercase))
    return "".join(result)


def apply_chaos(text: str, dial: float) -> str:
    """
    Apply algorithmic chaos for dial values < 0.
    dial should be negative; magnitude determines intensity.
    """
    if dial >= 0:
        return text

    level = min(abs(dial), 10.0)  # clamp to [0, 10]
    rng = random.Random()  # use a fresh RNG each call for unpredictability

    # Tier 1: -0.1 to -1 — subtle, realistic typos
    if level >= 0.1:
        scale = min(level, 1.0)
        text = _apply_to_chars(text, 0.03 * scale, _adjacent_key)
        text = _transpose(text, 0.03 * scale)
        text = _homophone_swap(text, 0.1 * scale)

    # Tier 2: -1 to -3 — noticeable errors
    if level >= 1.0:
        scale = min((level - 1.0) / 2.0, 1.0)
        text = _drop_char(text, 0.04 * scale)
        text = _double_char(text, 0.04 * scale)
        text = _apply_to_chars(text, 0.06 * scale, _adjacent_key)
        text = _homophone_swap(text, 0.3 * scale)

    # Tier 3: -3 to -5 — word-level chaos
    if level >= 3.0:
        scale = min((level - 3.0) / 2.0, 1.0)
        text = _scramble_word_internals(text, 0.4 * scale + 0.1)
        text = _drop_char(text, 0.08 * scale)
        text = _random_case(text, 0.15 * scale)

    # Tier 4: -5 to -10 — nuclear
    if level >= 5.0:
        scale = min((level - 5.0) / 5.0, 1.0)
        text = _inject_random_chars(text, 0.1 * scale)
        text = _apply_to_chars(
            text, 0.2 * scale, lambda ch: random.choice(string.ascii_lowercase)
        )
        text = _random_case(text, 0.4 * scale)
        # at extreme levels, shuffle words too
        if scale > 0.6:
            words = text.split()
            random.shuffle(words)
            text = " ".join(words)

    return text
