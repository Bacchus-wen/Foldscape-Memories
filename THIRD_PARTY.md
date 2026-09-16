# Third-party assets

## Apple

The following assets originate from Apple's [iPhone Duo product page](https://www.apple.com/iphone-duo/):

- `public/models/iphone-duo.usdz`: a prepared landscape pose of Apple's model.
- `public/models/iphone-duo.glb`: a converted model with split folding geometry, adjusted materials, and replaceable screen surfaces. Includes textures from Apple's model.
- `public/wallpapers/apple-desert.avif` and `apple-desert-cover.avif`: wallpaper textures from Apple's model.

The original model, textures, product design, and Apple trademarks remain the property of Apple and their respective owners. These assets are excluded from this repository's MIT license. Attribution is not a grant of redistribution or commercial-use rights. Review Apple's applicable terms and obtain any necessary permissions for your intended use. Replace these assets with your own if you need a wholly MIT-licensed distribution.

The folding renderer is independently implemented. Apple viewer code and runtime are not included.

## Reference Home Screen images

`public/wallpapers/reference-home.png` and `reference-home-cover.png` are perspective-corrected crops from the user-supplied reference clip at 5.6 seconds:

https://video.twimg.com/amplify_video/2097782703810916352/vid/avc1/2160x3840/8dHmKNa3F7eY2Mzu.mp4?tag=29

They contain photographed Apple app icons and widgets, not independent icon assets or functional widgets. The cover is a crop of the inner display, not a separate cover-screen capture. These images are for local visual comparison and are excluded from the MIT license. The clip owner has not been identified and redistribution permission has not been established. Do not publish these images without clearance.

## Original screen artwork

`home-apps.svg`, `home-cover.svg`, `home-photo.svg`, `tide.svg`, and `ink.svg` are original SVG artwork included under the MIT license. The `home-photo.svg` filename refers to the incoming card slot; its content is a Mastra Factory illustration, not a photograph.

The Factory card is demo artwork requested for this study. Mastra's name is not licensed by this repository, and the artwork does not imply an official announcement or endorsement.

## Dependencies

Third-party software dependencies retain their own licenses. Exact versions are recorded in `package-lock.json`.

## API-sourced app icons

`public/app-icons/*.jpg` are individual app artwork images downloaded through Apple’s iTunes Lookup API. `public/app-icons/sources.json` records each app ID and original artwork URL. `api-apps.svg` and `api-cover.svg` embed these images for reliable WebGL loading. App artwork remains the property of its owners and is excluded from MIT. API availability does not grant unrestricted redistribution rights.

`public/screen-content/icons/*.svg` are individually named containers used by the cover-screen compositor. Most embed the corresponding API-sourced app artwork above. The News, App Store, Rocket, Siri, and Settings samples, plus the weather/map widgets and search control, were cropped from the user-supplied visual reference for local prototype matching. `public/screen-content/ui/status-bar.svg` was supplied directly by the user. These reference-derived assets are excluded from the MIT license.

`reference-widgets.png` and `reference-cover-widgets.png` retain widget imagery from the reference clip described above. They are not API-sourced.

## Current model and user-supplied artwork

`public/assets/iphone-duo/` contains the original model package used by the current renderer, including geometry, animation, and textures. The Apple asset exclusions above apply to this package as well.

Finish-linked desert backgrounds, additional image/video wallpaper presets, and `public/screen-content/widgets/on-this-day.jpg` were supplied for this prototype. Their inclusion does not place them under the code's MIT license; their respective owners retain their rights.
