from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str
    secret_key: str = "dev-secret-change-me"
    access_token_expire_minutes: int = 1440
    worker_id: str = "worker-local-1"
    heartbeat_interval_seconds: int = 5
    stale_worker_seconds: int = 15
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
