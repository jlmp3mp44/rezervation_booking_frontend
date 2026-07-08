from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("http://localhost:5173")
    page.wait_for_timeout(1000)
    page.get_by_role("button", name="Вхід").click()
    page.wait_for_timeout(1000)

    # Catch console logs and any toast messages
    page.on("console", lambda msg: print(f"Browser console: {msg.text}"))

    # Check if the toast is shown
    page.get_by_text("Login with Google").click()
    page.wait_for_timeout(2000)

    browser.close()
