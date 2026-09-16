import { useEffect, useRef, useState } from 'react'
import { animate, useReducedMotion } from 'motion/react'
import { FoldablePhone, PhoneDevice, useFoldablePhone } from './iphone-duo'
import { openingAngleToProgress, progressToOpeningAngle } from './iphone-duo/fold-choreography'
import { getDemoLoop } from './iphone-duo/diorama/demo-playback'
import './memory-demo.css'

const PHOTO = '/scenes/lighthouse/reference.jpg'
const PAGE = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1120"><rect width="1600" height="1120" fill="#e9e4d8"/></svg>')

function usePhotoCover() {
  const [cover, setCover] = useState('')
  const [error, setError] = useState(false)
  useEffect(() => {
    let cancelled = false
    const photo = new Image()
    photo.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 800; canvas.height = 1120
      const ctx = canvas.getContext('2d')
      // The attachment contains photo + reference. Frame only the original photo.
      const height = photo.naturalHeight / 2
      const width = height * canvas.width / canvas.height
      const left = Math.min(photo.naturalWidth - width, photo.naturalWidth * .68 - width / 2)
      ctx.drawImage(photo, left, 0, width, height, 0, 0, canvas.width, canvas.height)
      if (!cancelled) setCover(canvas.toDataURL('image/jpeg', .95))
    }
    photo.onerror = () => { if (!cancelled) setError(true) }
    photo.src = PHOTO
    return () => { cancelled = true }
  }, [])
  return { cover, error }
}

function Experience() {
  const { progress, setValue } = useFoldablePhone()
  const [p, setP] = useState(progress.get())
  const [playing, setPlaying] = useState(false)
  const [finish, setFinish] = useState('star-white')
  const [rotation, setRotation] = useState({ x: 0, y: 0, z: 0 })
  const [zoom, setZoom] = useState(.91)
  const reduced = useReducedMotion()
  const animation = useRef(null)
  const { cover, error } = usePhotoCover()
  useEffect(() => progress.on('change', setP), [progress])
  useEffect(() => () => animation.current?.stop(), [])
  useEffect(() => {
    if (!playing || reduced) return
    // Reach a stable loop origin first; each effect owns only its own animations.
    animation.current?.stop()
    let cancelled = false
    let playback
    const leadIn = animate(progress, 0, {
      duration: Math.max(.01, progress.get()*1.6), ease:'easeInOut',
    })
    animation.current = leadIn
    leadIn.then(() => {
      if (cancelled) return
      const { keyframes, ...options } = getDemoLoop()
      playback = animate(progress, keyframes, options)
      animation.current = playback
    })
    return () => { cancelled = true; leadIn.stop(); playback?.stop() }
  }, [playing, reduced, progress])
  useEffect(() => { if (reduced) setPlaying(false) }, [reduced])
  const stop = () => { animation.current?.stop(); setPlaying(false) }
  const go = angle => {
    stop()
    const target = openingAngleToProgress(angle)
    if (reduced) setValue(target)
    else animation.current = animate(progress, target, { duration: 1.6 * Math.max(.3,Math.abs(target-progress.get())), ease: 'easeInOut' })
  }
  const angle = progressToOpeningAngle(p)
  const opening = Math.min(1,p/.96)
  const stage = angle < 8 ? '照片，收进掌心' : angle < 135 ? '让记忆慢慢立起来' : '一处可以翻开的风景'
  return <main className="memory-app">
    <header className="memory-header">
      <a className="memory-brand" href="/" aria-label="Duo Memory 首页"><span className="book-mark" aria-hidden="true"><i/><i/></span><strong>duo<span> / </span>memory</strong></a>
      <span className="memory-edition">A LITTLE WORLD, UNFOLDED.</span>
      <a className="original-link" href="/?view=original">原版 Duo <span aria-hidden="true">↗</span></a>
    </header>
    <section className="memory-layout">
      <aside className="memory-story">
        <div className="story-overline"><span/> PHOTO → LITTLE WORLD</div>
        <h1>一张照片。<br/>一个小世界。</h1>
        <p className="story-intro">翻开 Duo，<br/>让记忆从屏幕上立起来。</p>
        <figure className="memory-photo">
          <div className="photo-crop"><img src={PHOTO} alt="平静水面上的红白灯塔与两座小屋"/></div>
          <figcaption><span>01 / 岸外灯塔</span><span>原始照片</span></figcaption>
        </figure>
        <button className="story-open" onClick={() => go(angle < 100 ? 150 : 0)}>{angle < 100 ? '翻开这段记忆' : '收起这片风景'}<span aria-hidden="true">{angle < 100 ? '↗' : '↙'}</span></button>
        <div className="story-note"><span>DUO × TRIPO</span><p>旅行照片的立体书实验</p></div>
      </aside>
      <div className="memory-stage">
        <div className="stage-label"><span className="stage-dot"/> INTERACTIVE EDITION <span className="stage-number">001</span></div>
        <div className="memory-device-area">
          {error ? <p className="memory-error">照片加载失败，请刷新页面重试。</p> : cover ? <PhoneDevice
            diorama modelSrc="/assets/iphone-duo/iphone-duo.gltf" screenSrc={PAGE} coverSrc={cover}
            depthEnabled={false} foldEffects={false} foldProjection={false} blur={0} parallax={0}
            rotationX={-6 - opening*46 + rotation.x} rotation={-10 - opening*6 + rotation.y} rotationZ={rotation.z}
            zoom={zoom} exposure={1.05} finish={finish} dragToRotate
            onRotationChange={next => { stop(); setRotation({ x: next.x + 6 + opening*46, y: next.y + 10 + opening*6, z: next.z }) }}
            onZoomChange={setZoom}
          /> : <p className="memory-loading">正在展开一段记忆…</p>}
        </div>
        <div className="stage-caption" aria-live="polite"><span>{stage}</span><small>拖动旋转 · 滚轮缩放</small></div>
        <div className="memory-controls">
          <div className="control-top">
            <div className="angle-presets" aria-label="开合姿态">
              {[0,90,180].map((a,i)=><button key={a} aria-pressed={Math.abs(angle-a)<3} onClick={()=>go(a)}><span aria-hidden="true">{['▯','⌑','▭'][i]}</span>{['合上','半开','展开'][i]}</button>)}
            </div>
            <div className="finish-options" aria-label="机身颜色">
              <button className="finish-white" aria-label="银白色" aria-pressed={finish==='star-white'} onClick={()=>setFinish('star-white')}/>
              <button className="finish-dark" aria-label="深蓝色" aria-pressed={finish==='night-sky'} onClick={()=>setFinish('night-sky')}/>
            </div>
          </div>
          <div className="control-bottom">
            <button className="play-toggle" aria-label={playing?'暂停演示':'自动演示'} aria-pressed={playing} disabled={reduced} onClick={()=>setPlaying(v=>!v)}>{playing?'Ⅱ':'▶'}</button>
            <input type="range" min="0" max="1" step="0.001" value={p} aria-label="开合角度" aria-valuetext={`${angle}°`} style={{'--progress':`${p*100}%`}} onChange={e=>{stop();setValue(Number(e.target.value))}}/>
            <output>{angle}<span>°</span></output>
            <button className="reset-view" aria-label="重置视角" onClick={()=>{stop();setRotation({x:0,y:0,z:0});setZoom(.91)}}>↺</button>
          </div>
        </div>
      </div>
    </section>
    <footer className="memory-footer"><span>FROM A MOMENT TO A MINIATURE.</span><span>记忆有了另一种形状。</span></footer>
  </main>
}

export function MemoryDemo() {
  useEffect(()=>{ document.title = 'Duo Memory · 翻开一个小世界' },[])
  return <FoldablePhone defaultValue={0}><Experience/></FoldablePhone>
}
