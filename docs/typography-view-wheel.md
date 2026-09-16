# Typography, view wheel and scene framing

- Narrative copy uses local Cormorant Garamond 500 at 20–25px; display headings retain their serif/italic contrast. Inter remains the functional face, with quieter caption sizing and tracking.
- View & device now contains only Scene, Landscape and Closed. The existing OptionWheel implementation shares the supplied component's circular positioning, exponential smoothing and distance blur. Adapted supplied parameters: spacing 1.4, curve 1, tilt 6°, blur 2, fade .25, smoothing 200ms. Size/inset fit the three-item panel. Controlled selection remains synchronized with device presets, without resetting during intermediate poses.
- Device color is beside Sound settings, with Star White and Night Sky choices.
- Three.js camera framing interpolates from unchanged closed framing to .9 scene scale and +20 CSS-pixel vertical displacement. The full-page render area remains unrestricted.
- No dependencies or fonts downloaded.

Verification: 75 automated tests passed; production build passed; Chrome screenshots checked narrative typography and Option Wheel; Scene/Landscape selections and Night Sky material change verified. Camera projection regression verifies exact 90% scale and 20px movement.

## Final control revision

- Removed the View & device entry and both device-control dialogs. The view wheel now lives on the right of the main scene; its wheel input is excluded from photograph navigation.
- The color swatch directly toggles Star White / Night Sky without opening an overlay.
- The user clarified that the opening size means 1.2 times the previous wheel zoom limit: 1.55 × 1.2 = 1.86. Both the showcase endpoint and zoom ceiling now use that value. The existing .9 framing and +20px vertical placement remain unchanged.
- Automatic orbit starts 1500ms after showcase completion; drag-release pause behavior is retained.
