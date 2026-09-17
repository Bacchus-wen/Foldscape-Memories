# Screen portal unfolding

The landscape retains its authored position and proportions on the final unfolded plane. Visibility is determined exclusively by the actual moving left screen: opening the lid releases space above the fixed right screen, then reveals the left part as the lid passes vertical and approaches flat. There is no independent horizontal height sweep or timed building growth.

- Both halves share one moving screen plane, including shadow clipping.
- Visibility and the small water-surface offset depend on the angle between the lid and the stationary scene, not the playback clock. Holding the lid still holds the visible volume still; rewind retraces the same space.
- Temporary cut faces seal only the intersection with the moving lid. They are triangulated from actual mesh intersections, with spatial rejection, cached unchanged planes and reusable GPU buffers. There is no horizontal cut face.
- Cut faces use pale ice or neutral stone; these temporary interiors do not reproduce the exterior texture. They are hidden at the closed and open endpoints and disposed on scene replacement.
- Stencil winding was tested and rejected because delivered meshes have open boundaries; it produced unintended patches. No stencil buffer is required.
- The left water reflection fades in near flat to avoid a tilted duplicate silhouette. Full opening restores both reflections.
- The authored scene geometry is not rebuilt or scaled per frame. Meadow shoreline instances remain with the stationary scene and share the clipping rule.

Validation covers all five delivered models at closed, partial, open and reversed poses: fixed transforms, shared visible space at the hinge, no lost above-screen geometry at full opening, cut faces inside the scene bounds and on the actual lid plane, and repeatable reverse motion. A separate test holds the lid angle fixed while changing playback progress and asserts identical clipping. Open-bottom geometry tests check that the cut face fills the interior without extending outside its outline.

Automatic orbit resumes 500 ms after opening or rotation inertia ends. A stationary outer-screen click uses Open memory; drags suppress the click.
