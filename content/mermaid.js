
var mmd = (() => {
  var loaded = false

  var MIN_SCALE = 0.05
  var MAX_SCALE = 16

  // active panzoom instances (svg -> entry) so we can tear them down on re-render
  var entries = []

  var walk = (regex, string, result = [], match = regex.exec(string)) =>
    !match ? result : walk(regex, string, result.concat(match[1]))

  // natural (unscaled) dimensions of a mermaid svg
  var naturalSize = (svg) => {
    var viewBox = svg.viewBox && svg.viewBox.baseVal
    if (viewBox && viewBox.width && viewBox.height) {
      return {w: viewBox.width, h: viewBox.height}
    }
    var w = parseFloat(svg.getAttribute('width'))
    var h = parseFloat(svg.getAttribute('height'))
    if (w && h) {
      return {w, h}
    }
    var box = svg.getBBox()
    return {w: box.width, h: box.height}
  }

  // scale + center the diagram inside the viewport (container)
  // cap=true limits the scale to 100% so we never enlarge a diagram that already fits
  var fit = (panzoom, svg, container, cap) => {
    var {w, h} = naturalSize(svg)
    var cw = container.clientWidth
    var ch = container.clientHeight
    if (!w || !h || !cw || !ch) return

    var scale = Math.min(cw / w, ch / h)
    if (cap) scale = Math.min(scale, 1)
    scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))

    panzoom.zoom(scale, {animate: false})
    panzoom.pan((cw - w * scale) / 2, (ch - h * scale) / 2, {animate: false})
  }

  var cleanup = () => {
    entries.forEach((entry) => {
      var {pre, code, svg, panzoom, toolbar, onWheel, onDbl, onZoom, onPan, onFullscreen} = entry
      code.removeEventListener('wheel', onWheel)
      code.removeEventListener('dblclick', onDbl)
      svg.removeEventListener('panzoomzoom', onZoom)
      svg.removeEventListener('panzoompan', onPan)
      document.removeEventListener('fullscreenchange', onFullscreen)
      panzoom.destroy()
      if (toolbar && toolbar.parentNode) toolbar.parentNode.removeChild(toolbar)
      if (pre) pre.removeAttribute('data-zoom')
    })
    entries = []
  }

  var setup = () => {
    Array.from(document.querySelectorAll('pre code.mermaid svg')).forEach((svg) => {
      var code = svg.parentElement
      var pre = code && code.parentElement
      if (!pre || pre.hasAttribute('data-zoom')) return
      pre.setAttribute('data-zoom', '')

      var panzoom = Panzoom(svg, {
        canvas: true,
        cursor: 'grab',
        minScale: MIN_SCALE,
        maxScale: MAX_SCALE,
      })

      // toolbar
      var toolbar = document.createElement('div')
      toolbar.className = 'mmd-toolbar'
      toolbar.innerHTML = [
        '<button class="mmd-btn" data-zoom="out" title="Zoom out">&#8722;</button>',
        '<button class="mmd-btn mmd-scale" data-zoom="reset" title="Reset to 100%">100%</button>',
        '<button class="mmd-btn" data-zoom="in" title="Zoom in">+</button>',
        '<span class="mmd-sep"></span>',
        '<button class="mmd-btn" data-zoom="fit" title="Fit to viewport">Fit</button>',
        '<button class="mmd-btn" data-zoom="fullscreen" title="Fullscreen">&#9974;</button>',
      ].join('')

      var label = toolbar.querySelector('.mmd-scale')
      var updateLabel = () => {
        label.textContent = Math.round(panzoom.getScale() * 100) + '%'
      }

      var onZoom = () => updateLabel()
      var onPan = () => updateLabel()
      var onWheel = (e) => {
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey) return
        panzoom.zoomWithWheel(e)
      }
      var onDbl = (e) => {
        e.preventDefault()
        panzoom.zoomIn()
      }
      var onFullscreen = () => {
        var fullscreen = document.fullscreenElement === pre
        if (document.fullscreenElement && !fullscreen) return
        fit(panzoom, svg, code, !fullscreen)
        updateLabel()
      }

      toolbar.addEventListener('click', (e) => {
        var button = e.target.closest('[data-zoom]')
        if (!button) return
        var action = button.getAttribute('data-zoom')

        if (action === 'in') panzoom.zoomIn()
        else if (action === 'out') panzoom.zoomOut()
        else if (action === 'reset') {
          panzoom.zoom(1, {animate: false})
          panzoom.pan(0, 0, {animate: false})
        }
        else if (action === 'fit') fit(panzoom, svg, code, false)
        else if (action === 'fullscreen') {
          if (document.fullscreenElement) {
            document.exitFullscreen()
          }
          else if (pre.requestFullscreen) {
            pre.requestFullscreen()
          }
        }
        updateLabel()
      })

      // fit the diagram into the available width on load (never enlarge)
      fit(panzoom, svg, code, true)
      updateLabel()

      svg.addEventListener('panzoomzoom', onZoom)
      svg.addEventListener('panzoompan', onPan)
      code.addEventListener('wheel', onWheel, {passive: false})
      code.addEventListener('dblclick', onDbl)
      document.addEventListener('fullscreenchange', onFullscreen)

      pre.appendChild(toolbar)

      entries.push({
        pre, code, svg, panzoom, toolbar,
        onWheel, onDbl, onZoom, onPan, onFullscreen,
      })
    })
  }

  return {
    render: () => {
      if (loaded) {
        var definitions = walk(/<pre><code class="mermaid">([\s\S]+?)<\/code><\/pre>/gi, state.html)

        Array.from(document.querySelectorAll('pre code.mermaid')).forEach((diagram, index) => {
          diagram.removeAttribute('data-processed')
          diagram.innerHTML = definitions[index]
        })
      }

      var theme =
        state._themes[state.theme] === 'dark' ||
        (state._themes[state.theme] === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
        ? 'dark' : 'default'

      cleanup()
      mermaid.initialize({theme, useMaxWidth: false, startOnLoad: false})
      mermaid.init({theme}, 'code.mermaid')
      loaded = true

      var attempts = 0
      var timeout = setInterval(() => {
        attempts++
        var diagrams = Array.from(document.querySelectorAll('pre code.mermaid'))
        if (!diagrams.length) {
          clearInterval(timeout)
          return
        }
        var svg = Array.from(document.querySelectorAll('pre code.mermaid svg'))
        if (diagrams.length === svg.length || attempts > 200) {
          clearInterval(timeout)
          setup()
        }
      }, 50)
    }
  }
})()
