"""
Engagement weights and algorithm constants — Single Source of Truth.

Based on X 2026 Phoenix Algorithm (Grok-powered recommendation system).
Source: xai-org/x-algorithm open-source analysis + Buffer 18.8M post study.

All modules that calculate engagement scores MUST import from here.
"""

# ── Engagement Weights (X 2026 Phoenix Algorithm) ──────────────────────────
# These are multiplied by the raw count to get weighted score.
# "Like" is baseline (0.5x in algorithm, normalized to 1x here for backward compat).

ENGAGEMENT_WEIGHTS = {
    "conversation": 75,     # reply + author reply-back = 150x like total (EN ONEMLI!)
    "retweet": 20,          # 20x like
    "reply": 13.5,          # 13.5x like (reply without author reply-back)
    "profile_visit": 12,    # 12x like (not available in tweet metrics)
    "bookmark": 10,         # 10x like
    "dwell_time": 10,       # 10x like (2+ min reading, not available in tweet metrics)
    "quote_tweet": 10,      # ~10x like (approximate)
    "like": 1,              # 1x baseline (algorithm uses 0.5x, normalized here)
    "report": -369,         # massive negative signal
}

# Weights used in score calculation (only metrics available from tweet data)
W_RT = ENGAGEMENT_WEIGHTS["retweet"]
W_REPLY = ENGAGEMENT_WEIGHTS["reply"]
W_LIKE = ENGAGEMENT_WEIGHTS["like"]
W_BOOKMARK = ENGAGEMENT_WEIGHTS["bookmark"]


def calculate_engagement_score(tweet: dict) -> float:
    """
    Calculate weighted engagement score from tweet metrics dict.

    Expected keys: like_count, retweet_count, reply_count, bookmark_count.
    Optional: impression_count (adds engagement rate bonus).

    Returns: float score
    """
    likes = _safe_int(tweet.get("like_count", 0))
    rts = _safe_int(tweet.get("retweet_count", 0))
    replies = _safe_int(tweet.get("reply_count", 0))
    bookmarks = _safe_int(tweet.get("bookmark_count", 0))
    impressions = _safe_int(tweet.get("impression_count", 0))

    score = (rts * W_RT) + (replies * W_REPLY) + (likes * W_LIKE) + (bookmarks * W_BOOKMARK)

    # Engagement rate bonus (if impressions available)
    if impressions > 0:
        engagement_rate = (rts + replies + likes) / impressions
        score *= (1 + engagement_rate)

    return round(score, 2)


def _safe_int(val) -> int:
    """Safely convert to int, defaulting to 0."""
    if val is None:
        return 0
    try:
        return int(val)
    except (ValueError, TypeError):
        return 0


# ── Engagement Score Tooltip (for frontend display) ──────────────────────
ENGAGEMENT_TOOLTIP = (
    f"Score = likes x{W_LIKE} + RTs x{W_RT} + "
    f"replies x{W_REPLY} + bookmarks x{W_BOOKMARK}"
)
