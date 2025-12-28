// stealth.js - Human Emulation Utilities

// Cubic Bezier Easing for natural movement
function bezier(t, p0, p1, p2, p3) {
    const u = 1 - t;
    const tt = t * t;
    const uu = u * u;
    const uuu = uu * u;
    const ttt = tt * t;

    return (uuu * p0) + (3 * uu * t * p1) + (3 * u * tt * p2) + (ttt * p3);
}

// Generate a random path point with noise
function randomPoint(min, max) {
    return Math.random() * (max - min) + min;
}

export async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Simulates a human-like mouse movement and click on an element.
 * Note: Since we can't truly move the OS cursor from an extension,
 * we rely on dispatching Trusted Events if possible, or high-fidelity simulation events.
 *
 * Chrome extensions CANNOT move the real mouse.
 * But we can fire a sequence of MouseOver, MouseMove, MouseDown, MouseUp, Click
 * that looks chemically pure to most listeners.
 */
export async function humanClick(element) {
    if (!element) return;

    // Scroll into view first
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(randomPoint(300, 600));

    // Get coordinates
    const rect = element.getBoundingClientRect();
    const x = rect.left + (rect.width / 2) + randomPoint(-5, 5);
    const y = rect.top + (rect.height / 2) + randomPoint(-5, 5);

    // Fire MouseOver
    element.dispatchEvent(new MouseEvent('mouseover', {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y
    }));
    await sleep(randomPoint(50, 150));

    // Fire MouseDown
    element.dispatchEvent(new MouseEvent('mousedown', {
        view: window,
        bubbles: true,
        cancelable: true,
        buttons: 1,
        clientX: x,
        clientY: y
    }));

    // Hold click (dwell time)
    await sleep(randomPoint(80, 200));

    // Fire MouseUp
    element.dispatchEvent(new MouseEvent('mouseup', {
        view: window,
        bubbles: true,
        cancelable: true,
        buttons: 1,
        clientX: x,
        clientY: y
    }));

    // Fire standard Click
    element.dispatchEvent(new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true,
        buttons: 1,
        clientX: x,
        clientY: y
    }));
}

/**
 * Simulates human typing.
 * Fires keydown, keypress, input, textInput, keyup for each character.
 */
export async function humanType(element, text) {
    element.focus();

    // Clear existing text just in case (optional)
    // element.value = "";

    for (const char of text) {
        // Random typing speed (wpm)
        const delay = randomPoint(50, 150);
        await sleep(delay);

        // KeyDown
        element.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
        // KeyPress
        element.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));

        // Input (Logic)
        // Note: For React apps, we might need value setter + input event hack
        // But Reddit is mostly Custom Elements (Shreddit) or React
        const valueSetter = Object.getOwnPropertyDescriptor(element.__proto__, 'value')?.set;
        // Try standard value set -> dispatch input
        if (document.execCommand) {
            // Deprecated but works for some legacy
            // document.execCommand('insertText', false, char);
        }

        // Fallback: standard web
        element.value += char;

        element.dispatchEvent(new InputEvent('input', { data: char, bubbles: true, inputType: 'insertText' }));

        // KeyUp
        element.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
    }

    // Final verify
    element.dispatchEvent(new Event('change', { bubbles: true }));
}
