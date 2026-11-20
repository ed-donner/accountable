def test_meta_gives_the_clocks_today(client):
    response = client.get("/api/meta")
    assert response.status_code == 200
    assert response.json() == {"today": "2026-11-19"}
