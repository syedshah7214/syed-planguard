import pytest
from fastapi.testclient import TestClient

from planguard.api import create_app


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(str(tmp_path / "pg.db"), cors=[])) as c:
        yield c


def test_health_and_headers(client):
    r = client.get("/health")
    assert r.json()["status"] == "ok" and r.headers["x-frame-options"] == "DENY"


def test_reference_endpoints(client):
    assert len(client.get("/api/v1/rules").json()) >= 18
    p = client.get("/api/v1/pricing").json()
    assert p["region"] == "us-east-1" and "data transfer" in p["excluded"]
    names = {s["name"] for s in client.get("/api/v1/samples").json()}
    assert {"risky-startup-stack", "student-lab-secure"} <= names
    assert client.get("/api/v1/samples/nope").status_code == 404


def test_analyze_saves_history_and_stats(client):
    for name in ("risky-startup-stack", "student-lab-secure"):
        plan = client.get(f"/api/v1/samples/{name}").json()
        r = client.post("/api/v1/analyze", json={"plan": plan, "name": name, "source": "sample"}).json()
        assert r["id"] is not None
    hist = client.get("/api/v1/analyses").json()
    assert hist["total"] == 2 and hist["items"][0]["decision"] == "PASS"
    detail = client.get(f"/api/v1/analyses/{hist['items'][1]['id']}").json()
    assert detail["report"]["decision"] == "FAIL"
    md = client.get(f"/api/v1/analyses/{hist['items'][1]['id']}/markdown").text
    assert "FAIL" in md and "PG-SEC-001" in md
    s = client.get("/api/v1/stats").json()
    assert (s["analyses"], s["pass"], s["fail"]) == (2, 1, 1) and s["critical_findings"] == 3
    assert s["blocked_monthly_usd"] == pytest.approx(314.78)


def test_analyze_accepts_string_and_options_without_saving(client):
    plan = client.get("/api/v1/samples/kubernetes-cost-spike").text
    r = client.post("/api/v1/analyze", json={"plan": plan, "budget_usd": 1000, "save": False}).json()
    assert r["id"] is None and r["report"]["decision"] == "WARN"
    assert client.get("/api/v1/analyses").json()["total"] == 0


def test_analyze_validation(client):
    assert client.post("/api/v1/analyze", json={"plan": {"nope": 1}}).status_code == 422
    assert client.post("/api/v1/analyze", json={"plan": "{bad"}).status_code == 422
    assert client.post("/api/v1/analyze", json={"plan": {}, "fail_on": "extreme"}).status_code == 422
    assert client.get("/api/v1/analyses/999").status_code == 404
    big = "x" * (6 * 1024 * 1024)
    assert client.post("/api/v1/analyze", content=big, headers={"content-type": "application/json"}).status_code == 413
