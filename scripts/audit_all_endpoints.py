import json
import time
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime

BASE_URL = "http://127.0.0.1:8000"

def get_openapi_paths():
    req = urllib.request.Request(f"{BASE_URL}/openapi.json")
    with urllib.request.urlopen(req, timeout=5) as res:
        return json.loads(res.read().decode("utf-8"))

def test_request(method, path, body=None, content_type="application/json"):
    url = f"{BASE_URL}{path}"
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        if isinstance(body, dict):
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        elif isinstance(body, bytes):
            data = body
            headers["Content-Type"] = content_type

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    start_time = time.time()
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            duration = (time.time() - start_time) * 1000
            content = res.read()
            return {
                "status": res.status,
                "duration_ms": round(duration, 1),
                "error": None,
                "content_length": len(content),
                "is_json": "application/json" in res.headers.get("Content-Type", ""),
            }
    except urllib.error.HTTPError as e:
        duration = (time.time() - start_time) * 1000
        error_content = e.read()
        return {
            "status": e.code,
            "duration_ms": round(duration, 1),
            "error": f"HTTP {e.code}",
            "content_length": len(error_content),
            "is_json": "application/json" in e.headers.get("Content-Type", ""),
        }
    except Exception as e:
        duration = (time.time() - start_time) * 1000
        return {
            "status": 0,
            "duration_ms": round(duration, 1),
            "error": str(e),
            "content_length": 0,
            "is_json": False,
        }

def run_audit():
    schema = get_openapi_paths()
    paths = schema.get("paths", {})
    
    print(f"=== TrafficFlow API Audit (Base URL: {BASE_URL}) ===")
    print(f"Total OpenAPI Paths declared: {len(paths)}")
    print(f"Audit started at: {datetime.now().isoformat()}\n")

    # Sample data for parameterized routes
    sample_video_id = "test-video-sample-id"
    sample_task_id = "157a7170-5180-4450-8af1-29dd73514d69"
    sample_session_id = "test-session-id"
    sample_source_id = "cam-01"
    sample_upload_id = "test-upload-id"

    results = []

    # Iterate over all paths
    for path_template, methods in sorted(paths.items()):
        # Replace route parameters with representative IDs
        path = path_template
        path = path.replace("{video_id}", sample_video_id)
        path = path.replace("{task_id}", sample_task_id)
        path = path.replace("{session_id}", sample_session_id)
        path = path.replace("{source_id}", sample_source_id)
        path = path.replace("{upload_id}", sample_upload_id)

        for method, spec in methods.items():
            method = method.upper()
            summary = spec.get("summary") or spec.get("operationId") or path

            # Determine sample body if needed
            body = None
            if method in ("POST", "PUT"):
                if "config" in path:
                    body = {
                        "video_id": sample_video_id,
                        "roi": [[100, 100], [500, 100], [500, 400], [100, 400]],
                        "lanes": [{"lane_id": "lane-1", "name": "Lane 1", "counting_line": [[150, 200], [450, 200]]}]
                    }
                elif "sessions" in path or "resolve" in path:
                    body = {"source_url": "https://www.youtube.com/watch?v=MNn9qKG2UFI", "stream_type": "youtube"}
                elif "process" in path:
                    body = {"task_id": sample_task_id, "video_id": sample_video_id}
                elif "validate-config" in path:
                    body = {"roi": [[0, 0], [100, 0], [100, 100], [0, 100]], "lanes": []}
                else:
                    body = {}

            res = test_request(method, path, body)
            # A valid response means:
            # - HTTP 200, 201, 204
            # - HTTP 404 (for non-existent sample resource like session/task)
            # - HTTP 422 (FastAPI Pydantic schema validation error on input)
            # An UNHEALTHY response is 500 (Internal Server Error) or 0 (Connection Refused/Crash)
            healthy = res["status"] in (200, 201, 204, 400, 404, 422) and res["status"] != 500

            results.append({
                "template": path_template,
                "path": path,
                "method": method,
                "summary": summary,
                "status": res["status"],
                "duration_ms": res["duration_ms"],
                "error": res["error"],
                "healthy": healthy
            })

            status_icon = "OK" if healthy else "FAIL"
            print(f"[{status_icon:<4}] {method:<6} {path:<45} -> HTTP {res['status']:<3} ({res['duration_ms']}ms)")

    # Test static assets & frontend root
    static_tests = [
        ("GET", "/", "Frontend Single Page Application index.html"),
        ("GET", "/assets/favicon-C_Gel58r.svg", "Frontend Favicon Asset"),
        ("GET", "/static/previews/cd0ff4ec-e1d2-45ba-9501-ecaa0213b396.jpg", "Static Camera Preview Image"),
        ("GET", "/openapi.json", "OpenAPI Specification"),
        ("GET", "/docs", "Swagger UI Documentation"),
    ]

    print("\n--- Testing Static Assets & Documentation ---")
    for method, path, desc in static_tests:
        res = test_request(method, path)
        healthy = res["status"] == 200
        results.append({
            "template": path,
            "path": path,
            "method": method,
            "summary": desc,
            "status": res["status"],
            "duration_ms": res["duration_ms"],
            "error": res["error"],
            "healthy": healthy
        })
        status_icon = "OK" if healthy else "FAIL"
        print(f"[{status_icon:<4}] {method:<6} {path:<45} -> HTTP {res['status']:<3} ({res['duration_ms']}ms) - {desc}")

    total = len(results)
    passed = sum(1 for r in results if r["healthy"])
    failed = total - passed
    server_errors = sum(1 for r in results if r["status"] == 500)

    print(f"\n==========================================")
    print(f"API Audit Complete:")
    print(f"Total endpoints tested: {total}")
    print(f"Responsive & Healthy:   {passed}/{total}")
    print(f"500 Internal Errors:    {server_errors}")
    print(f"Failed / Unreachable:   {failed}")
    print(f"==========================================")

    # Save report as json
    with open("storage/api_audit_results.json", "w", encoding="utf-8") as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "summary": {"total": total, "passed": passed, "failed": failed, "server_errors": server_errors},
            "results": results
        }, f, indent=2)
    print("Saved audit report to storage/api_audit_results.json")

if __name__ == "__main__":
    run_audit()
