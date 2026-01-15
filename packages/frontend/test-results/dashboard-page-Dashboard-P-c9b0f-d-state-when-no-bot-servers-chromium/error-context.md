# Page snapshot

```yaml
- generic [ref=e2]:
      - generic [ref=e4]:
            - complementary [ref=e5]:
                  - heading "LukBot" [level=2] [ref=e7]
                  - navigation [ref=e8]:
                        - link "📊 Dashboard" [ref=e9] [cursor=pointer]:
                              - /url: /
                              - generic [ref=e10]: 📊
                              - generic [ref=e11]: Dashboard
                        - link "⚙️ Features" [ref=e12] [cursor=pointer]:
                              - /url: /features
                              - generic [ref=e13]: ⚙️
                              - generic [ref=e14]: Features
            - generic [ref=e15]:
                  - banner [ref=e16]:
                        - generic [ref=e18]:
                              - text: Select Server
                              - combobox [ref=e19]:
                                    - option "Select a server..." [selected]
                                    - option "Test Server 2"
                        - generic [ref=e20]:
                              - generic [ref=e21]:
                                    - img "testuser" [ref=e22]
                                    - generic [ref=e23]: testuser
                              - button "Logout" [ref=e24] [cursor=pointer]
                  - main [ref=e25]:
                        - generic [ref=e26]:
                              - img [ref=e28]
                              - heading "No Server Selected" [level=2] [ref=e30]
                              - paragraph [ref=e31]: Select a server from the dropdown above to manage it
                              - button "View Your Servers" [ref=e32] [cursor=pointer]
      - region "Notifications alt+T"
```
