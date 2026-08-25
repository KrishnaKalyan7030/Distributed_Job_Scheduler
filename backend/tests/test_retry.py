from types import SimpleNamespace
from app.services import retry_delay
def test_fixed(): assert retry_delay(SimpleNamespace(strategy="fixed",base_delay_seconds=5,max_delay_seconds=100),3)==5
def test_linear(): assert retry_delay(SimpleNamespace(strategy="linear",base_delay_seconds=5,max_delay_seconds=100),3)==15
def test_exponential(): assert retry_delay(SimpleNamespace(strategy="exponential",base_delay_seconds=5,max_delay_seconds=100),3)==20
