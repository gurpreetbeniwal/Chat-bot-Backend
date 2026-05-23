// We wrap everything in an IIFE (Immediately Invoked Function Expression) 
// so our variables don't accidentally mess up the host website's code!
(function() {
    // 1. CONFIGURATION
    // The production URL where your React app is running/hosted
    const REACT_APP_PRODUCTION_URL = 'https://gurpreetbeniwal.nextgrowth.in'; 

    // 2. Determine URL dynamically (Auto-detect Local Development vs. Production)
    let reactUrl = REACT_APP_PRODUCTION_URL;
    
    // Check if we are running locally (on localhost or 127.0.0.1)
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        reactUrl = 'http://localhost:3000'; // Local React dev server port
    }
    
    // Format the URL properly if it's missing the protocol
    if (!reactUrl.startsWith('http://') && !reactUrl.startsWith('https://')) {
        reactUrl = 'https://' + reactUrl;
    }

    // 3. Create the Chat Button
    const chatBtn = document.createElement('div');
    chatBtn.id = 'edtech-chat-toggle';
    chatBtn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
    `;
    
    // Style the button
    Object.assign(chatBtn.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '60px',
        height: '60px',
        backgroundColor: '#007bff',
        color: 'white',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: '999999',
        transition: 'transform 0.3s ease'
    });

    // 4. Create the hidden Chat Window (Iframe) pointing to the /widget route
    const chatIframe = document.createElement('iframe');
    chatIframe.src = reactUrl + '/widget';
    
    // Style the window
    Object.assign(chatIframe.style, {
        position: 'fixed',
        bottom: '90px',
        right: '20px',
        width: '380px',
        height: '600px',
        border: 'none',
        borderRadius: '12px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
        display: 'none',
        zIndex: '999999',
        backgroundColor: 'white',
        opacity: '0',
        transition: 'opacity 0.3s ease',
        overflow: 'hidden'
    });

    // 5. Add the Click Logic (Open/Close)
    let isOpen = false;
    
    chatBtn.addEventListener('click', () => {
        isOpen = !isOpen;
        
        if (isOpen) {
            chatIframe.style.display = 'block';
            // Slight delay for the fade-in effect
            setTimeout(() => chatIframe.style.opacity = '1', 10);
            
            // Change icon to an 'X'
            chatBtn.innerHTML = `
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            `;
            chatBtn.style.transform = 'rotate(90deg)';
        } else {
            chatIframe.style.opacity = '0';
            setTimeout(() => chatIframe.style.display = 'none', 300); // Wait for fade out
            
            // Change icon back to Chat bubble
            chatBtn.innerHTML = `
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            `;
            chatBtn.style.transform = 'rotate(0deg)';
        }
    });

    // 6. Inject them into the host website
    document.body.appendChild(chatIframe);
    document.body.appendChild(chatBtn);
})();