"""
Tweet Publisher Module
Handles posting tweets, quote tweets, and threads to X/Twitter
"""
import tweepy
import time


class TweetPublisher:
    """Publishes tweets to X/Twitter using API v2"""

    def __init__(self, api_key: str, api_secret: str,
                 access_token: str, access_secret: str,
                 bearer_token: str = None):
        self.client = tweepy.Client(
            bearer_token=bearer_token,
            consumer_key=api_key,
            consumer_secret=api_secret,
            access_token=access_token,
            access_token_secret=access_secret,
            wait_on_rate_limit=True
        )

    def post_tweet(self, text: str) -> dict:
        """
        Post a single tweet

        Returns:
            dict with 'success', 'tweet_id', 'url', 'error' keys
        """
        try:
            response = self.client.create_tweet(text=text)
            tweet_id = response.data["id"]
            return {
                "success": True,
                "tweet_id": tweet_id,
                "url": f"https://x.com/i/status/{tweet_id}",
                "error": None
            }
        except tweepy.Forbidden as e:
            return {"success": False, "tweet_id": None, "url": None,
                    "error": f"Yetki hatası: {e}"}
        except tweepy.TooManyRequests:
            return {"success": False, "tweet_id": None, "url": None,
                    "error": "Rate limit aşıldı. Lütfen biraz bekleyin."}
        except Exception as e:
            return {"success": False, "tweet_id": None, "url": None,
                    "error": f"Hata: {e}"}

    def post_quote_tweet(self, text: str, quoted_tweet_id: str) -> dict:
        """
        Post a quote tweet

        Args:
            text: The quote tweet text
            quoted_tweet_id: ID of the tweet being quoted

        Returns:
            dict with result info
        """
        # Validate tweet ID format
        if not quoted_tweet_id or not str(quoted_tweet_id).strip().isdigit():
            return {"success": False, "tweet_id": None, "url": None,
                    "error": "Geçersiz tweet ID formatı. Tweet URL'sini kontrol edin."}

        try:
            response = self.client.create_tweet(
                text=text,
                quote_tweet_id=str(quoted_tweet_id).strip()
            )
            tweet_id = response.data["id"]
            return {
                "success": True,
                "tweet_id": tweet_id,
                "url": f"https://x.com/i/status/{tweet_id}",
                "error": None
            }
        except tweepy.Forbidden as e:
            return {"success": False, "tweet_id": None, "url": None,
                    "error": f"Yetki hatası: {e}"}
        except tweepy.BadRequest as e:
            return {"success": False, "tweet_id": None, "url": None,
                    "error": f"Quote edilecek tweet bulunamadı veya erişilemez: {e}"}
        except tweepy.TooManyRequests:
            return {"success": False, "tweet_id": None, "url": None,
                    "error": "Rate limit aşıldı. Lütfen biraz bekleyin."}
        except Exception as e:
            return {"success": False, "tweet_id": None, "url": None,
                    "error": f"Hata: {e}"}

    def post_reply(self, text: str, reply_to_tweet_id: str) -> dict:
        """
        Post a reply to an existing tweet

        Args:
            text: The reply text
            reply_to_tweet_id: ID of the tweet being replied to

        Returns:
            dict with 'success', 'tweet_id', 'url', 'error' keys
        """
        if not reply_to_tweet_id or not str(reply_to_tweet_id).strip().isdigit():
            return {"success": False, "tweet_id": None, "url": None,
                    "error": "Geçersiz tweet ID formatı."}

        try:
            response = self.client.create_tweet(
                text=text,
                in_reply_to_tweet_id=str(reply_to_tweet_id).strip()
            )
            tweet_id = response.data["id"]
            return {
                "success": True,
                "tweet_id": tweet_id,
                "url": f"https://x.com/i/status/{tweet_id}",
                "error": None
            }
        except tweepy.Forbidden as e:
            return {"success": False, "tweet_id": None, "url": None,
                    "error": f"Yetki hatası: {e}"}
        except tweepy.TooManyRequests:
            return {"success": False, "tweet_id": None, "url": None,
                    "error": "Rate limit aşıldı. Lütfen biraz bekleyin."}
        except Exception as e:
            return {"success": False, "tweet_id": None, "url": None,
                    "error": f"Hata: {e}"}

    def post_thread(self, tweets: list[str]) -> list[dict]:
        """
        Post a thread (series of connected tweets)

        Args:
            tweets: List of tweet texts in order

        Returns:
            List of result dicts for each tweet
        """
        results = []
        previous_tweet_id = None

        for i, tweet_text in enumerate(tweets):
            try:
                if previous_tweet_id:
                    response = self.client.create_tweet(
                        text=tweet_text,
                        in_reply_to_tweet_id=previous_tweet_id
                    )
                else:
                    response = self.client.create_tweet(text=tweet_text)

                tweet_id = response.data["id"]
                previous_tweet_id = tweet_id

                results.append({
                    "success": True,
                    "tweet_id": tweet_id,
                    "url": f"https://x.com/i/status/{tweet_id}",
                    "index": i + 1,
                    "error": None
                })

                # Small delay between thread tweets
                if i < len(tweets) - 1:
                    time.sleep(1)

            except Exception as e:
                results.append({
                    "success": False,
                    "tweet_id": None,
                    "url": None,
                    "index": i + 1,
                    "error": f"Tweet {i+1} hatası: {e}"
                })
                break

        return results

    def delete_tweet(self, tweet_id: str) -> dict:
        """Delete a tweet by ID"""
        try:
            self.client.delete_tweet(id=tweet_id)
            return {"success": True, "error": None}
        except Exception as e:
            return {"success": False, "error": f"Silme hatası: {e}"}

    def get_me(self) -> dict:
        """Get authenticated user info"""
        try:
            response = self.client.get_me(
                user_fields=["name", "username", "profile_image_url",
                             "public_metrics", "description"]
            )
            if response.data:
                user = response.data
                return {
                    "success": True,
                    "name": user.name,
                    "username": user.username,
                    "profile_image": getattr(user, 'profile_image_url', ''),
                    "followers": user.public_metrics.get("followers_count", 0) if user.public_metrics else 0,
                    "following": user.public_metrics.get("following_count", 0) if user.public_metrics else 0,
                    "tweet_count": user.public_metrics.get("tweet_count", 0) if user.public_metrics else 0,
                    "bio": getattr(user, 'description', ''),
                }
            return {"success": False, "error": "Kullanıcı bilgisi alınamadı"}
        except Exception as e:
            return {"success": False, "error": f"Hata: {e}"}
