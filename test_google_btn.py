from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("http://localhost:5173")
    page.wait_for_timeout(1000)
    page.get_by_role("button", name="Вхід").click()
    page.wait_for_timeout(1000)

    # Enable request interception to see the API response
    def handle_response(response):
        if "google/url" in response.url:
            print(f"Response status: {response.status}")
            print(f"Response text: {response.text()}")

    page.on("response", handle_response)

    page.get_by_text("Login with Google").click()
    page.wait_for_timeout(2000)

    browser.close()
