"""
Twikit Client Module
Sync wrapper for twikit's async API for free Twitter search operations.
Uses cookie-based auth to avoid Twitter API costs.

Async strategy: A dedicated background event loop runs in a daemon thread.
Sync methods submit coroutines to this loop via run_coroutine_threadsafe().
This avoids nest_asyncio which is incompatible with Python 3.14 + anyio
(asyncio.current_task() returns None → weak-reference errors in anyio).
"""
import asyncio
import builtins
import contextlib
import datetime
import re
import threading
import time
from pathlib import Path

import traceback

from twikit.errors import (
    AccountLocked,
    AccountSuspended,
    BadRequest,
    Forbidden,
    NotFound,
    TooManyRequests,
    TwitterException,
    Unauthorized,
)

LOGIN_TIMEOUT = 30  # seconds — prevents infinite hang on interactive prompts

DATA_DIR = Path(__file__).parent.parent.parent / "data"
COOKIES_PATH = DATA_DIR / "twikit_cookies.json"


def _safe_int(val) -> int:
    """Safely convert a value to int (twikit sometimes returns strings)."""
    if val is None:
        return 0
    try:
        return int(val)
    except (ValueError, TypeError):
        return 0


# ---------- Background event loop (daemon thread) ----------
# A single persistent loop avoids nest_asyncio and keeps httpx connections
# alive across calls.  The daemon thread exits when the main process exits.
_bg_loop: asyncio.AbstractEventLoop | None = None
_bg_lock = threading.Lock()


def _get_bg_loop() -> asyncio.AbstractEventLoop:
    """Return (and lazily start) the shared background event loop."""
    global _bg_loop
    if _bg_loop is not None and not _bg_loop.is_closed():
        return _bg_loop
    with _bg_lock:
        if _bg_loop is not None and not _bg_loop.is_closed():
            return _bg_loop
        _bg_loop = asyncio.new_event_loop()

        def _run_loop():
            asyncio.set_event_loop(_bg_loop)
            # Suppress Streamlit "missing ScriptRunContext" warnings
            # that fire when any code touches st internals from this thread.
            import logging
            logging.getLogger("streamlit.runtime.scriptrunner_utils.script_run_context").setLevel(logging.ERROR)
            _bg_loop.run_forever()

        t = threading.Thread(target=_run_loop, daemon=True,
                             name="twikit-async-loop")
        t.start()
    return _bg_loop


async def _ensure_sniffio_asyncio(coro):
    """Wrap a coroutine so sniffio (if installed) detects asyncio.

    httpcore calls sniffio.current_async_library() to pick its async backend.
    When coroutines run on a background event loop via run_coroutine_threadsafe,
    the task inherits the *calling* thread's context where sniffio's cvar is
    unset → AsyncLibraryNotFoundError.  Setting the cvar inside the task
    fixes detection for all awaited code within it.
    """
    try:
        import sniffio
        token = sniffio.current_async_library_cvar.set("asyncio")
    except (ImportError, AttributeError):
        token = None
    try:
        return await coro
    finally:
        if token is not None:
            sniffio.current_async_library_cvar.reset(token)


def adapt_query_for_web(query: str, since_date: str = None) -> str:
    """Adapt Twitter API v2 search operators to web search format."""
    q = query.replace("-is:retweet", "-filter:retweets")
    q = q.replace("-is:reply", "-filter:replies")
    # lang: filtresi korunuyor — Türkçe tweet filtrelemesi için gerekli
    if since_date:
        q += f" since:{since_date}"
    return re.sub(r'\s+', ' ', q).strip()


class TwikitSearchClient:
    """Sync wrapper for twikit async client, focused on search/read operations."""

    def __init__(self, username: str = "", password: str = "",
                 email: str = "", totp_secret: str = ""):
        self.username = username
        self.password = password
        self.email = email
        self.totp_secret = totp_secret
        self._client = None
        self._authenticated = False
        self._cookie_source = ""  # Track how we authenticated: "secrets", "file", "login"
        self.last_error = ""  # Store last error for UI display

    def _run(self, coro, timeout=120):
        """Run an async coroutine on the background event loop."""
        loop = _get_bg_loop()
        future = asyncio.run_coroutine_threadsafe(
            _ensure_sniffio_asyncio(coro), loop
        )
        return future.result(timeout=timeout)

    def _get_client_sync(self):
        """Get or create twikit Client (sync)."""
        if self._client is None:
            from twikit import Client
            self._client = Client('tr')
        return self._client

    def _bypass_client_transaction(self, silent=False):
        """Force ClientTransaction into bypass mode on the current client instance.
        Prevents 'cannot create weak reference to NoneType' errors that occur
        when twikit tries to fetch/parse the Twitter homepage (common on VPS/servers).

        Also monkey-patches the client's request() method to remove the
        X-Client-Transaction-Id header entirely (an empty string can cause 404s).
        """
        client = self._get_client_sync()
        ct = client.client_transaction
        if ct is None:
            return
        ct.home_page_response = "bypassed"
        ct.generate_transaction_id = lambda *a, **kw: ""
        async def _noop_init(*a, **kw):
            pass
        ct.init = _noop_init

        # Monkey-patch request() to strip the empty X-Client-Transaction-Id header
        if not getattr(client, '_ct_patched', False):
            _orig_request = client.request

            async def _patched_request(method, url, **kwargs):
                resp = await _orig_request(method, url, **kwargs)
                return resp

            # Instead of wrapping request, patch at the point where header is set:
            # twikit sets headers['X-Client-Transaction-Id'] = tid in request().
            # We can't easily intercept that, so we wrap the http.request call.
            _orig_http_request = client.http.request

            async def _http_request_no_ct(method, url, **kwargs):
                headers = kwargs.get('headers', {})
                # Remove empty CT header — Twitter may 404 on empty value
                if 'X-Client-Transaction-Id' in headers and not headers['X-Client-Transaction-Id']:
                    del headers['X-Client-Transaction-Id']
                return await _orig_http_request(method, url, **kwargs)

            client.http.request = _http_request_no_ct
            client._ct_patched = True

        if not silent:
            print("Twikit: ClientTransaction bypassed (no homepage fetch needed)")

    def authenticate(self, skip_cookies: bool = False) -> bool:
        """Authenticate with Twitter. Cookie-based auth is fully sync.
        Only falls back to async login() if no cookies available.

        Args:
            skip_cookies: If True, skip cookie loading and force login.
                          Used by re-auth when cookies are known to be stale.
        """
        self.last_error = ""

        # Create client (sync — no network call)
        from twikit import Client
        if self._client is None:
            self._client = Client('tr')

        # Immediately bypass ClientTransaction to prevent "weak reference to NoneType"
        # errors. CT requires fetching Twitter homepage which fails on most VPS/servers.
        # API calls work fine without the X-Client-Transaction-Id header.
        self._bypass_client_transaction()

        if not skip_cookies:
            # 1. Try cookies from secrets.toml
            try:
                from backend.modules._compat import get_secret
                secret_auth = get_secret("twikit_auth_token", "")
                secret_ct0 = get_secret("twikit_ct0", "")
                if secret_auth and secret_ct0:
                    self._client.set_cookies({
                        "auth_token": secret_auth,
                        "ct0": secret_ct0,
                    })
                    print("Twikit: cookies loaded from secrets.toml, CT bypassed")
                    self._authenticated = True
                    self._cookie_source = "secrets"
                    return True
            except Exception as e:
                print(f"Twikit: secrets.toml cookie error: {e}")

            # 2. Try loading saved cookies from file
            if COOKIES_PATH.exists():
                try:
                    self._client.load_cookies(str(COOKIES_PATH))
                    print("Twikit: cookies loaded from file, CT bypassed")
                    self._authenticated = True
                    self._cookie_source = "file"
                    return True
                except Exception as e:
                    self.last_error = f"Cookie yükleme hatası: {e}"
                    print(f"Twikit: cookie file error: {e}")
                    COOKIES_PATH.unlink(missing_ok=True)

        # 3. Login with credentials (async — only if no cookies)
        if not (self.username and self.password):
            if not self.last_error:
                self.last_error = "Cookie bulunamadı ve kullanıcı adı/şifre verilmedi"
            return False

        try:
            return self._run(self._login_async())
        except Exception as e:
            self.last_error = f"{type(e).__name__}: {e}"
            print(f"Twikit login error: {e}")
            return False

    def validate_connection(self) -> bool:
        """Validate that current cookies actually work by making a lightweight API call.
        Returns True if the connection is valid, False otherwise."""
        if not self._authenticated:
            return False
        try:
            self._run(self._validate_async())
            return True
        except (NotFound, Unauthorized, Forbidden) as e:
            error_type = type(e).__name__
            print(f"Twikit validation failed: {error_type}: {e}")
            self.last_error = (
                f"Cookie doğrulama başarısız ({error_type}). "
                "Cookie'ler geçersiz veya süresi dolmuş olabilir. "
                "Tarayıcıdan yeni auth_token ve ct0 cookie'lerini alıp tekrar deneyin."
            )
            self._authenticated = False
            return False
        except Exception as e:
            error_str = str(e)
            error_type = type(e).__name__
            print(f"Twikit validation failed: {error_type}: {e}")
            traceback.print_exc()
            if "KEY_BYTE" in error_str or "Couldn't get key" in error_str:
                self.last_error = (
                    "Twitter güvenlik token'ı alınamadı. "
                    "IP engellenmiş veya cookie'ler geçersiz olabilir."
                )
            else:
                self.last_error = f"Cookie doğrulama hatası: {error_type}: {e}"
            self._authenticated = False
            return False

    async def _validate_async(self):
        """Try a lightweight API call to validate cookies work."""
        self._bypass_client_transaction(silent=True)
        client = self._get_client_sync()
        # Use get_user_by_screen_name as a lighter endpoint than search
        # If username is available, validate with that; otherwise use search
        if self.username:
            await client.get_user_by_screen_name(self.username)
        else:
            await client.search_tweet("test", 'Latest', count=1)

    class _InputBlockedError(Exception):
        """Raised when twikit's login() calls input() for interactive verification."""
        pass

    @staticmethod
    @contextlib.contextmanager
    def _block_input():
        original_input = builtins.input

        def _raise_on_input(prompt=""):
            raise TwikitSearchClient._InputBlockedError(
                f"Twitter interaktif doğrulama istiyor (prompt: {prompt!r}). "
                "Streamlit ortamında stdin olmadığı için giriş yapılamaz."
            )

        builtins.input = _raise_on_input
        try:
            yield
        finally:
            builtins.input = original_input

    async def _login_async(self) -> bool:
        """Async login with username/password. Only called when no cookies.
        CT is already bypassed before this is called."""
        client = self._client

        try:
            DATA_DIR.mkdir(parents=True, exist_ok=True)

            login_kwargs = {
                "auth_info_1": self.username,
                "auth_info_2": self.email or self.username,
                "password": self.password,
                "enable_ui_metrics": False,
            }

            if self.totp_secret:
                login_kwargs["totp_secret"] = self.totp_secret

            with self._block_input():
                login_task = asyncio.ensure_future(client.login(**login_kwargs))
                done, pending = await asyncio.wait(
                    {login_task}, timeout=LOGIN_TIMEOUT
                )
                if pending:
                    login_task.cancel()
                    try:
                        await login_task
                    except asyncio.CancelledError:
                        pass
                    raise asyncio.TimeoutError()
                login_task.result()

            client.save_cookies(str(COOKIES_PATH))
            self._authenticated = True
            self._cookie_source = "login"
            return True

        except TwikitSearchClient._InputBlockedError as e:
            self.last_error = (
                "Twitter ek doğrulama istiyor (e-posta/telefon onayı veya 2FA). "
                "Çözüm: 1) twitter.com'dan giriş yapıp doğrulamayı tamamlayın, "
                "2) 2FA varsa Ayarlar'da TOTP secret girin."
            )
            print(f"Twikit login blocked (interactive input): {e}")
            return False

        except asyncio.TimeoutError:
            self.last_error = (
                f"Twitter giriş {LOGIN_TIMEOUT} saniyede tamamlanamadı (timeout). "
                "twitter.com'dan giriş yapıp hesabı kontrol edin."
            )
            return False

        except AccountLocked:
            self.last_error = (
                "Twitter hesabınız kilitli (Arkose challenge). "
                "twitter.com'dan giriş yapıp hesabı açın."
            )
            return False

        except AccountSuspended:
            self.last_error = "Twitter hesabınız askıya alınmış."
            return False

        except TooManyRequests as e:
            reset_ts = getattr(e, 'rate_limit_reset', None)
            if reset_ts:
                wait_min = max(1, int((reset_ts - time.time()) / 60) + 1)
                self.last_error = f"Rate limit. ~{wait_min} dakika sonra tekrar deneyin."
            else:
                self.last_error = "Rate limit. 15-30 dakika bekleyip tekrar deneyin."
            return False

        except BadRequest:
            self.last_error = "Kullanıcı adı/şifre yanlış olabilir (400)."
            return False

        except Forbidden:
            self.last_error = "Erişim reddedildi (403). twitter.com'dan kontrol edin."
            return False

        except (Unauthorized, NotFound) as e:
            self.last_error = f"Giriş hatası ({type(e).__name__}). Şifreyi kontrol edin."
            return False

        except TwitterException as e:
            self.last_error = f"Twitter hatası: {e}"
            return False

        except Exception as e:
            error_type = type(e).__name__
            error_str = str(e)
            # Full traceback for debugging
            print(f"Twikit login exception [{error_type}]: {e}")
            traceback.print_exc()
            if "ConnectError" in error_type or "ConnectError" in error_str:
                self.last_error = "Twitter'a bağlanılamıyor. İnternet bağlantısını kontrol edin."
            elif "Tunnel connection failed" in error_str or "ProxyError" in error_type:
                self.last_error = "Proxy hatası — Twitter'a bağlanılamıyor. Proxy ayarlarını kontrol edin."
            elif "name resolution" in error_str.lower():
                self.last_error = "DNS hatası — Twitter'a bağlanılamıyor. DNS ayarlarını kontrol edin."
            else:
                self.last_error = f"{error_type}: {e}"
            return False

    @property
    def is_authenticated(self) -> bool:
        return self._authenticated

    def search_tweets(self, query: str, count: int = 20,
                      since_date: str = None) -> list[dict]:
        """Search tweets. Returns list of tweet dicts."""
        if not self._authenticated:
            return []
        adapted = adapt_query_for_web(query, since_date)
        return self._run(self._search_async(adapted, count))

    async def _retry_after_reauth(self, coro_factory):
        """Reset client, force login (skip stale cookies), then run coro_factory().
        Returns None on failure.
        NOTE: This runs on the background event loop, so we must NOT call
        sync methods that use _run() (would deadlock). Use async directly."""
        self._authenticated = False
        self._client = None
        # Re-create client and bypass CT
        from twikit import Client
        self._client = Client('tr')
        self._bypass_client_transaction(silent=True)

        # Try async login directly (avoid deadlock from sync authenticate → _run)
        if self.username and self.password:
            try:
                logged_in = await self._login_async()
                if logged_in:
                    self._authenticated = True
                    try:
                        return await coro_factory()
                    except Exception as e2:
                        self.last_error = f"Yeniden deneme hatası: {type(e2).__name__}: {e2}"
                        print(f"Twikit retry failed: {e2}")
                else:
                    self.last_error = f"Yeniden giriş başarısız: {self.last_error}"
            except Exception as e:
                self.last_error = f"Yeniden giriş hatası: {type(e).__name__}: {e}"
                print(f"Twikit re-auth error: {e}")
        else:
            self.last_error = "Yeniden giriş için kullanıcı adı/şifre gerekli"
        return None

    async def _search_async(self, query: str, count: int) -> list[dict]:
        results = []
        try:
            self._bypass_client_transaction(silent=True)
            client = self._get_client_sync()
            tweets = await client.search_tweet(query, 'Latest', count=count)
            for tweet in tweets:
                results.append(self._tweet_to_dict(tweet))
        except (NotFound, Unauthorized, Forbidden, TypeError, AttributeError) as e:
            err_str = str(e)
            err_name = type(e).__name__
            # Transport/async errors (weak reference, sniffio) are NOT auth
            # issues — re-auth would just hit the same error again.
            if "weak reference" in err_str or "async library" in err_str.lower():
                self.last_error = (
                    f"Async transport hatası: {err_name}: {e}. "
                    "Uygulamayı yeniden başlatmayı deneyin."
                )
                print(f"Twikit search transport error: {err_name}: {e}")
            elif err_name == "Forbidden" or "403" in err_str:
                # Search 403 is NOT an auth issue — it's an IP/endpoint restriction.
                # Do NOT re-auth (it destroys working cookies for other operations).
                self.last_error = (
                    "Erişim reddedildi (403). Twitter arama bu IP'den kısıtlanmış olabilir. "
                    "Grok motorunu kullanmayı deneyin."
                )
                print(f"Twikit search 403 — NOT re-authing (preserving cookies): {e}")
            else:
                print(f"Twikit search {err_name}, attempting re-auth...")
                self.last_error = f"Arama hatası ({err_name}): {e}"
                if self.username and self.password:
                    async def _retry():
                        c = self._get_client_sync()
                        tw = await c.search_tweet(query, 'Latest', count=count)
                        return [self._tweet_to_dict(t) for t in tw]
                    retry_result = await self._retry_after_reauth(_retry)
                    if retry_result is not None:
                        return retry_result
        except TooManyRequests as e:
            reset_ts = getattr(e, 'rate_limit_reset', None)
            self.last_error = "Arama rate limit. Biraz bekleyip tekrar deneyin."
            print(f"Twikit search: TooManyRequests (reset={reset_ts})")
        except Exception as e:
            error_str = str(e)
            error_type = type(e).__name__
            # Better error messages for common network issues
            if "ConnectError" in error_type or "ConnectError" in error_str:
                self.last_error = "Twitter'a bağlanılamıyor. İnternet bağlantısını kontrol edin."
            elif "Tunnel connection failed" in error_str or "ProxyError" in error_type:
                self.last_error = "Proxy hatası — Twitter'a bağlanılamıyor."
            elif "name resolution" in error_str.lower():
                self.last_error = "DNS hatası — Twitter adresi çözümlenemiyor."
            elif "Couldn't get KEY_BYTE" in error_str or "client_transaction" in error_str.lower():
                self.last_error = (
                    "Twitter güvenlik token'ı alınamadı (ClientTransaction). "
                    "VPS/sunucu IP'si Twitter tarafından engellenmiş olabilir. "
                    "Cookie'leri tarayıcıdan yapıştırmayı deneyin."
                )
            elif "Couldn't get key" in error_str:
                self.last_error = (
                    "Twitter sayfa yapısı okunamadı. "
                    "Twitter erişim engelliyor olabilir."
                )
            else:
                self.last_error = f"Arama hatası: {error_type}: {e}"
            print(f"Twikit search error: {error_type}: {e}")
        return results

    def get_user_tweets(self, username: str, count: int = 10,
                        progress_callback=None) -> list[dict]:
        """Get recent tweets from a user with pagination. Returns list of tweet dicts."""
        if not self._authenticated:
            return []
        return self._run(self._user_tweets_async(username, count, progress_callback))

    async def _user_tweets_async(self, username: str, count: int,
                                  progress_callback=None) -> list[dict]:
        results = []

        def _safe_progress(msg):
            """Call progress_callback, ignoring Streamlit thread errors."""
            if not progress_callback:
                return
            try:
                progress_callback(msg)
            except Exception:
                pass  # NoSessionContext etc. when called from background thread

        try:
            self._bypass_client_transaction(silent=True)
            client = self._get_client_sync()
            user = await client.get_user_by_screen_name(username)
            if not user:
                self.last_error = f"@{username} kullanıcısı bulunamadı"
                return results

            cursor = None
            seen_ids = set()
            max_pages = (count // 20) + 2  # Safety limit

            for page in range(max_pages):
                if len(results) >= count:
                    break

                _safe_progress(
                    f"@{username}: {len(results)}/{count} tweet çekiliyor... (sayfa {page + 1})"
                )

                try:
                    if cursor:
                        tweets = await cursor.next()
                    else:
                        tweets = await client.get_user_tweets(
                            user.id, 'Tweets', count=min(count, 20)
                        )

                    if not tweets:
                        break

                    cursor = tweets
                    new_count = 0

                    for tweet in tweets:
                        tweet_id = str(getattr(tweet, 'id', ''))
                        if tweet_id in seen_ids:
                            continue
                        seen_ids.add(tweet_id)

                        d = self._tweet_to_dict(tweet)
                        d['author_name'] = user.name or username
                        d['author_username'] = user.screen_name or username
                        d['author_profile_image'] = getattr(user, 'profile_image_url', '') or ''
                        results.append(d)
                        new_count += 1

                        if len(results) >= count:
                            break

                    # No new tweets found, stop paginating
                    if new_count == 0:
                        break

                except Exception as page_err:
                    err_name = type(page_err).__name__
                    if err_name in ("StopIteration", "StopAsyncIteration"):
                        break  # No more pages
                    print(f"Twikit pagination error (page {page + 1}): {page_err}")
                    self.last_error = f"Sayfa {page + 1} hatası: {err_name}: {page_err}"
                    break

        except (NotFound, Unauthorized, Forbidden, TwitterException,
                TypeError, AttributeError) as e:
            err_name = type(e).__name__
            err_str = str(e)
            # Transport/async errors are NOT auth issues — skip re-auth
            if "weak reference" in err_str or "async library" in err_str.lower():
                self.last_error = (
                    f"@{username}: Async transport hatası: {err_name}: {e}. "
                    "Uygulamayı yeniden başlatmayı deneyin."
                )
                print(f"Twikit user tweets transport error: {err_name}: {e}")
            else:
                self.last_error = f"Kullanıcı tweet hatası (@{username}): {err_name}: {e}"
                print(f"Twikit user tweets {err_name}, attempting re-auth...")
                if self.username and self.password:
                    async def _retry():
                        return await self._user_tweets_async(username, count, progress_callback)
                    retry_result = await self._retry_after_reauth(_retry)
                    if retry_result is not None:
                        return retry_result
        except TooManyRequests as e:
            reset_ts = getattr(e, 'rate_limit_reset', None)
            if reset_ts:
                wait_sec = max(10, int(reset_ts - time.time()) + 2)
            else:
                wait_sec = 60
            # Kalan sonuçlar varsa döndür, yoksa bekle ve tekrar dene
            if results:
                self.last_error = f"Rate limit ({len(results)} tweet çekildi, geri kalanı atlandı)."
                print(f"Twikit user tweets: TooManyRequests after {len(results)} tweets, returning partial")
            else:
                self.last_error = f"Kullanıcı tweet rate limit. ~{wait_sec}sn bekleyip tekrar deneyin."
                print(f"Twikit user tweets: TooManyRequests, wait {wait_sec}s")
        except Exception as e:
            error_str = str(e)
            error_type = type(e).__name__
            if "ConnectError" in error_type or "ConnectError" in error_str:
                self.last_error = f"@{username} tweet çekme: Twitter'a bağlanılamıyor."
            elif "Couldn't get KEY_BYTE" in error_str or "client_transaction" in error_str.lower():
                self.last_error = (
                    f"@{username}: Twitter güvenlik token'ı alınamadı. "
                    "VPS IP'si engellenmiş olabilir."
                )
            else:
                self.last_error = f"Kullanıcı tweet hatası (@{username}): {error_type}: {e}"
            print(f"Twikit user tweets error ({username}): {error_type}: {e}")

        return results

    def _tweet_to_dict(self, tweet) -> dict:
        """Convert a twikit Tweet object to a standardized dict."""
        # Parse datetime — try property first, then standard Twitter format
        created_at = None
        try:
            created_at = tweet.created_at_datetime
        except Exception:
            raw_date = getattr(tweet, 'created_at', None)
            if raw_date and isinstance(raw_date, str):
                for fmt in ("%a %b %d %H:%M:%S %z %Y", "%Y-%m-%dT%H:%M:%S.%fZ"):
                    try:
                        created_at = datetime.datetime.strptime(raw_date, fmt)
                        break
                    except ValueError:
                        continue
        if not created_at:
            created_at = datetime.datetime.now(datetime.timezone.utc)

        if created_at and created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=datetime.timezone.utc)

        # User info
        user = getattr(tweet, 'user', None)

        # Media URLs
        media_urls = []
        for m in (getattr(tweet, 'media', None) or []):
            url = getattr(m, 'url', None) or getattr(m, 'media_url_https', None)
            if url:
                media_urls.append(url)

        return {
            'id': str(getattr(tweet, 'id', '')),
            'text': (getattr(tweet, 'full_text', '')
                     or getattr(tweet, 'text', '')
                     or ''),
            'author_name': getattr(user, 'name', 'Unknown') if user else 'Unknown',
            'author_username': getattr(user, 'screen_name', 'unknown') if user else 'unknown',
            'author_profile_image': (getattr(user, 'profile_image_url', '') or '') if user else '',
            'author_followers_count': _safe_int(getattr(user, 'followers_count', 0)) if user else 0,
            'created_at': created_at,
            'like_count': _safe_int(getattr(tweet, 'favorite_count', 0)),
            'retweet_count': _safe_int(getattr(tweet, 'retweet_count', 0)),
            'reply_count': _safe_int(getattr(tweet, 'reply_count', 0)),
            'impression_count': _safe_int(getattr(tweet, 'view_count', 0)),
            'media_urls': media_urls,
        }

    def get_tweet_by_id(self, tweet_id: str) -> dict | None:
        """Fetch a specific tweet by its ID using twikit."""
        if not self._authenticated:
            return None
        return self._run(self._get_tweet_by_id_async(tweet_id))

    async def _get_tweet_by_id_async(self, tweet_id: str) -> dict | None:
        try:
            self._bypass_client_transaction(silent=True)
            client = self._get_client_sync()
            tweet = await client.get_tweet_by_id(tweet_id)
            if tweet:
                return self._tweet_to_dict(tweet)
        except Exception as e:
            print(f"Twikit get_tweet_by_id error: {type(e).__name__}: {e}")
        return None

    def get_thread(self, tweet_id: str) -> list[dict]:
        """Fetch the full thread for a given tweet using twikit.

        Strategy:
        1. Get the tweet to find its author
        2. Search for conversation tweets from the same author using
           conversation_id (which twikit's Tweet object exposes)
        3. Walk up reply chain if conversation_id not available
        4. Return list of tweet dicts sorted oldest-first
        """
        if not self._authenticated:
            return []
        return self._run(self._get_thread_async(tweet_id))

    async def _get_thread_async(self, tweet_id: str) -> list[dict]:
        try:
            self._bypass_client_transaction(silent=True)
            client = self._get_client_sync()
            tweet = await client.get_tweet_by_id(tweet_id)
            if not tweet:
                return []

            author_id = None
            user = getattr(tweet, 'user', None)
            if user:
                author_id = getattr(user, 'id', None) or getattr(user, 'rest_id', None)
            author_screen = getattr(user, 'screen_name', '') if user else ''

            # Strategy 1: Use conversation_id to search all thread tweets
            conv_id = getattr(tweet, 'conversation_id', None)

            thread_tweets = {}  # id -> tweet dict
            main_tweet_dict = self._tweet_to_dict(tweet)
            thread_tweets[str(getattr(tweet, 'id', tweet_id))] = main_tweet_dict

            if conv_id and author_screen:
                try:
                    query = f"conversation_id:{conv_id} from:{author_screen}"
                    results = await client.search_tweet(query, 'Latest', count=40)
                    for t in (results or []):
                        tid = str(getattr(t, 'id', ''))
                        if tid and tid not in thread_tweets:
                            thread_tweets[tid] = self._tweet_to_dict(t)
                except Exception as e:
                    print(f"Twikit thread conversation search error: {e}")

            # Strategy 2: Walk up the reply chain (in_reply_to)
            current = tweet
            walk_count = 0
            while walk_count < 15:
                reply_to_id = (getattr(current, 'in_reply_to_tweet_id', None)
                               or getattr(current, 'reply_to', None))
                if not reply_to_id:
                    break
                reply_to_id = str(reply_to_id)
                if reply_to_id in thread_tweets:
                    break
                try:
                    parent = await client.get_tweet_by_id(reply_to_id)
                    if not parent:
                        break
                    # Only include tweets from the same author (self-thread)
                    parent_user = getattr(parent, 'user', None)
                    parent_author_id = None
                    if parent_user:
                        parent_author_id = (getattr(parent_user, 'id', None)
                                            or getattr(parent_user, 'rest_id', None))
                    if author_id and parent_author_id and str(parent_author_id) != str(author_id):
                        break  # Different author = not a self-thread
                    thread_tweets[reply_to_id] = self._tweet_to_dict(parent)
                    current = parent
                    walk_count += 1
                except Exception:
                    break

            # Sort by created_at (oldest first)
            sorted_tweets = sorted(
                thread_tweets.values(),
                key=lambda t: t.get('created_at') or datetime.datetime.min.replace(
                    tzinfo=datetime.timezone.utc
                ),
            )
            return sorted_tweets

        except Exception as e:
            print(f"Twikit get_thread error: {type(e).__name__}: {e}")
            # Fallback: return single tweet
            try:
                single = await self._get_tweet_by_id_async(tweet_id)
                return [single] if single else []
            except Exception:
                return []

    def get_user_info(self, username: str) -> dict | None:
        """Get user profile info. Returns dict with user data."""
        if not self._authenticated:
            return None
        return self._run(self._user_info_async(username))

    async def _user_info_async(self, username: str) -> dict | None:
        try:
            self._bypass_client_transaction(silent=True)
            client = self._get_client_sync()
            user = await client.get_user_by_screen_name(username)
            if not user:
                return None

            return {
                "id": str(getattr(user, 'id', '')),
                "name": getattr(user, 'name', ''),
                "username": getattr(user, 'screen_name', username),
                "bio": getattr(user, 'description', ''),
                "followers_count": getattr(user, 'followers_count', 0) or 0,
                "following_count": getattr(user, 'friends_count', 0) or 0,
                "tweet_count": getattr(user, 'statuses_count', 0) or 0,
                "is_blue_verified": getattr(user, 'is_blue_verified', False) or False,
                "profile_image_url": getattr(user, 'profile_image_url', '') or '',
                "profile_banner_url": getattr(user, 'profile_banner_url', '') or '',
            }
        except Exception as e:
            self.last_error = f"Kullanıcı bilgi hatası (@{username}): {type(e).__name__}: {e}"
            print(f"Twikit user info error ({username}): {e}")
            return None

    def get_user_followers(self, username: str, limit: int = 200,
                           verified_only: bool = False,
                           progress_callback=None) -> list[dict]:
        """
        Get followers of a user. Optionally filter to verified (blue tick) only.
        Returns list of user dicts.
        """
        if not self._authenticated:
            return []
        return self._run(self._user_followers_async(
            username, limit, verified_only, progress_callback
        ))

    async def _user_followers_async(self, username: str, limit: int,
                                     verified_only: bool,
                                     progress_callback) -> list[dict]:
        self._bypass_client_transaction(silent=True)
        results = []
        try:
            client = self._get_client_sync()
            user = await client.get_user_by_screen_name(username)
            if not user:
                return results

            cursor = None
            fetched = 0
            max_pages = (limit // 20) + 1

            for page in range(max_pages):
                if fetched >= limit:
                    break

                if progress_callback:
                    try:
                        progress_callback(f"@{username} takipçileri çekiliyor... ({fetched}/{limit})")
                    except Exception:
                        pass

                try:
                    if cursor:
                        followers = await cursor.next()
                    else:
                        followers = await client.get_user_followers(user.id, count=20)

                    if not followers:
                        break

                    cursor = followers

                    for follower in followers:
                        is_verified = getattr(follower, 'is_blue_verified', False) or False

                        if verified_only and not is_verified:
                            continue

                        results.append({
                            "id": str(getattr(follower, 'id', '')),
                            "name": getattr(follower, 'name', ''),
                            "username": getattr(follower, 'screen_name', ''),
                            "bio": getattr(follower, 'description', '') or '',
                            "followers_count": getattr(follower, 'followers_count', 0) or 0,
                            "following_count": getattr(follower, 'friends_count', 0) or 0,
                            "is_blue_verified": is_verified,
                            "profile_image_url": getattr(follower, 'profile_image_url', '') or '',
                        })
                        fetched += 1

                        if fetched >= limit:
                            break

                except Exception as e:
                    print(f"Followers pagination error: {e}")
                    break

        except Exception as e:
            self.last_error = f"Takipçi çekme hatası (@{username}): {type(e).__name__}: {e}"
            print(f"Twikit followers error ({username}): {e}")
        return results

    def clear_cookies(self):
        """Remove saved cookies to force re-login."""
        if COOKIES_PATH.exists():
            COOKIES_PATH.unlink()
        self._authenticated = False
        self._client = None  # Also reset client to force fresh start
