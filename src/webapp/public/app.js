let currentGuildId = null

async function checkAuth() {
    try {
        const response = await fetch('/api/auth/status')
        const data = await response.json()
        if (!data.authenticated) {
            window.location.href = '/api/auth/discord'
            return false
        }
        return true
    } catch (error) {
        console.error('Auth check failed:', error)
        showStatus('Authentication required. Redirecting...', 'error')
        setTimeout(() => {
            window.location.href = '/api/auth/discord'
        }, 2000)
        return false
    }
}

function showStatus(message, type = 'success') {
    const statusDiv = document.getElementById('status')
    statusDiv.textContent = message
    statusDiv.className = `status ${type}`
    setTimeout(() => {
        statusDiv.textContent = ''
        statusDiv.className = ''
    }, 5000)
}

async function loadGlobalToggles() {
    try {
        const response = await fetch('/api/toggles/global')
        const data = await response.json()
        renderToggles('globalToggles', data.toggles, true)
    } catch (error) {
        console.error('Failed to load global toggles:', error)
        showStatus('Failed to load global toggles', 'error')
    }
}

async function loadGuildToggles(guildId) {
    if (!guildId) {
        document.getElementById('guildToggles').innerHTML = '<p>Select a server to view server-specific toggles</p>'
        return
    }

    try {
        const response = await fetch(`/api/toggles/guild/${guildId}`)
        const data = await response.json()
        renderToggles('guildToggles', data.toggles, false, guildId)
    } catch (error) {
        console.error('Failed to load guild toggles:', error)
        showStatus('Failed to load server toggles', 'error')
    }
}

function renderToggles(containerId, toggles, isReadOnly, guildId = null) {
    const container = document.getElementById(containerId)
    container.innerHTML = ''

    if (Object.keys(toggles).length === 0) {
        container.innerHTML = '<p>No toggles available</p>'
        return
    }

    for (const [name, enabled] of Object.entries(toggles)) {
        const toggleItem = document.createElement('div')
        toggleItem.className = 'toggle-item'

        const toggleInfo = document.createElement('div')
        toggleInfo.innerHTML = `
            <div class="toggle-name">${name}</div>
            <div class="toggle-description">Feature toggle: ${name}</div>
        `

        const toggleSwitch = document.createElement('label')
        toggleSwitch.className = 'toggle-switch'
        toggleSwitch.innerHTML = `
            <input type="checkbox" ${enabled ? 'checked' : ''} ${isReadOnly ? 'disabled' : ''}
                   onchange="updateToggle('${name}', this.checked, ${guildId ? `'${guildId}'` : 'null'})">
            <span class="slider"></span>
        `

        toggleItem.appendChild(toggleInfo)
        toggleItem.appendChild(toggleSwitch)
        container.appendChild(toggleItem)
    }
}

async function updateToggle(toggleName, enabled, guildId) {
    try {
        const url = guildId
            ? `/api/toggles/guild/${guildId}/${toggleName}`
            : `/api/toggles/global/${toggleName}`

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ enabled }),
        })

        const data = await response.json()

        if (response.ok) {
            showStatus(data.message || 'Toggle updated successfully', 'success')
        } else {
            showStatus(data.error || 'Failed to update toggle', 'error')
        }
    } catch (error) {
        console.error('Failed to update toggle:', error)
        showStatus('Failed to update toggle', 'error')
    }
}

async function loadGuilds() {
    const select = document.getElementById('guildSelect')
    select.innerHTML = '<option value="">Select a server...</option>'

    try {
        const response = await fetch('/api/guilds')
        const data = await response.json()

        if (data.guilds && data.guilds.length > 0) {
            data.guilds.forEach((guild) => {
                const option = document.createElement('option')
                option.value = guild.id
                option.textContent = guild.name
                select.appendChild(option)
            })
        }
    } catch (error) {
        console.error('Failed to load guilds:', error)
    }

    select.addEventListener('change', (e) => {
        currentGuildId = e.target.value
        if (currentGuildId) {
            loadGuildToggles(currentGuildId)
        } else {
            document.getElementById('guildToggles').innerHTML = '<p>Select a server to view server-specific toggles</p>'
        }
    })
}

async function init() {
    const authenticated = await checkAuth()
    if (!authenticated) return

    await loadGlobalToggles()
    await loadGuilds()
}

window.addEventListener('DOMContentLoaded', init)
window.updateToggle = updateToggle
