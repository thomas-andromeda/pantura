'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Grid from '@mui/material/Grid'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import OptionMenu from '@core/components/option-menu'
import CustomAvatar from '@core/components/mui/Avatar'
import { supabase } from '@/libs/supabaseClient'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts'

// ─── UBAH DI SINI untuk jumlah data chart ────────────────────────────────────
const DATA_LIMIT = 3000

// ─── OPEN-METEO ───────────────────────────────────────────────────────────────
const fetchOutdoorTemp = async (lat, lon) => {
  try {
    const url  = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m&timezone=auto`
    const res  = await fetch(url)
    if (!res.ok) throw new Error('Open-Meteo error')
    const json = await res.json()
    return {
      suhu:       json.current?.temperature_2m       ?? null,
      kelembapan: json.current?.relative_humidity_2m ?? null,
    }
  } catch {
    return { suhu: null, kelembapan: null }
  }
}

// ─── GPS ──────────────────────────────────────────────────────────────────────
const getGpsLocation = () =>
  new Promise((resolve, reject) =>
    navigator.geolocation
      ? navigator.geolocation.getCurrentPosition(
          p  => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
          err => reject(err),
          { timeout: 8000 }
        )
      : reject(new Error('Geolocation tidak didukung'))
  )

// ─── CUSTOM TOOLTIP ───────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <Box sx={{
      bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
      borderRadius: 1, p: 1.5, fontSize: '0.75rem', boxShadow: 3, minWidth: 180
    }}>
      <Typography variant='caption' display='block' color='text.secondary' mb={0.5}>{label}</Typography>
      {payload.map((p, i) => (
        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 0.2 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: p.color, flexShrink: 0 }} />
          <span>{p.name}: <strong>{p.value != null ? `${p.value}°C` : '—'}</strong></span>
        </Box>
      ))}
    </Box>
  )
}

// ─── KOMPONEN UTAMA ───────────────────────────────────────────────────────────
const IoTTempMonitor = () => {
  const [avgTemp,      setAvgTemp]      = useState(null)
  const [avgHum,       setAvgHum]       = useState(null)
  const [totalCount,   setTotalCount]   = useState(null)
  const [devStatus,    setDevStatus]    = useState('Checking...')
  const [outdoorTemp,  setOutdoorTemp]  = useState(null)
  const [outdoorHum,   setOutdoorHum]   = useState(null)
  const [locationName, setLocationName] = useState('')
  const [gpsStatus,    setGpsStatus]    = useState('idle') // idle | loading | ok | error
  const [chartData,    setChartData]    = useState([])
  const [chartLoading, setChartLoading] = useState(true)

  // Simpan koordinat supaya tidak perlu minta GPS berulang
  const coordsRef  = useRef({ lat: null, lon: null })
  // Simpan suhu luar di ref agar fetchSensor selalu bisa akses nilai terbaru
  const outdoorRef = useRef({ suhu: null, kelembapan: null })

  // ── Cek status device ─────────────────────────────────────────────────────
  const checkStatus = (lastTime) => {
    if (!lastTime) return 'Offline'
    return (new Date() - new Date(lastTime)) / 1000 > 10 ? 'Offline' : 'Online'
  }

  // ── Fetch data sensor ─────────────────────────────────────────────────────
  const fetchSensor = useCallback(async () => {
    try {
      // Stat cards: 10 data terbaru
      const { data: recent, error: e1, count } = await supabase
        .from('sensor_data')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(10)
      if (e1) throw e1

      if (recent?.length > 0) {
        const aT = recent.reduce((a, b) => a + b.suhu, 0)       / recent.length
        const aH = recent.reduce((a, b) => a + b.kelembapan, 0) / recent.length
        setAvgTemp(aT.toFixed(1))
        setAvgHum(aH.toFixed(1))
        setTotalCount(count ?? 0)
        setDevStatus(checkStatus(recent[0].created_at))
      }

      // Chart: DATA_LIMIT data, descending lalu di-reverse
      setChartLoading(true)
      const { data: raw, error: e2 } = await supabase
        .from('sensor_data')
        .select('suhu, kelembapan, created_at')
        .order('created_at', { ascending: false })
        .limit(DATA_LIMIT)
      if (e2) throw e2

      if (raw?.length > 0) {
        const sorted = [...raw].reverse()
        const step   = Math.max(1, Math.floor(sorted.length / 300))
        const oTemp  = outdoorRef.current.suhu

        setChartData(
          sorted
            .filter((_, i) => i % step === 0)
            .map(d => ({
              waktu:     new Date(d.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
              suhuDalam: d.suhu,
              // suhuLuar hanya diisi jika ada nilainya, biar tidak muncul null di chart
              ...(oTemp != null ? { suhuLuar: oTemp } : {}),
            }))
        )
      }
    } catch (err) {
      console.error('fetchSensor:', err.message)
    } finally {
      setChartLoading(false)
    }
  }, [])

  // ── Fetch suhu luar ───────────────────────────────────────────────────────
  const fetchOutdoor = useCallback(async () => {
    let { lat, lon } = coordsRef.current

    // Belum ada koordinat — minta GPS sekali saja
    if (lat == null) {
      setGpsStatus('loading')
      try {
        const pos = await getGpsLocation()
        lat = pos.lat
        lon = pos.lon
        coordsRef.current = { lat, lon }
        setGpsStatus('ok')

        // Nama kota — best-effort, tidak blocking
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`)
          .then(r => r.json())
          .then(j => {
            const city = j.address?.city || j.address?.town || j.address?.village || ''
            if (city) setLocationName(city)
          })
          .catch(() => {})
      } catch {
        setGpsStatus('error')
        return // tidak update apa-apa, biarkan tampilan tetap seperti sebelumnya
      }
    }

    // Ambil cuaca — jika gagal, jangan reset nilai lama
    const outdoor = await fetchOutdoorTemp(lat, lon)
    if (outdoor.suhu != null) {
      outdoorRef.current = outdoor
      setOutdoorTemp(outdoor.suhu)
      setOutdoorHum(outdoor.kelembapan)
    }
  }, [])

  // ── Full refresh ──────────────────────────────────────────────────────────
  const fullRefresh = useCallback(async () => {
    await fetchOutdoor()
    await fetchSensor()
  }, [fetchOutdoor, fetchSensor])

  // ── Mount ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    // GPS + cuaca duluan, baru chart (supaya garis suhu luar langsung muncul)
    fetchOutdoor().then(fetchSensor)

    const channel = supabase
      .channel('realtime_iot_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sensor_data' }, fetchSensor)
      .subscribe()

    const sensorTimer  = setInterval(fetchSensor,  30_000)
    const outdoorTimer = setInterval(fetchOutdoor, 5 * 60_000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(sensorTimer)
      clearInterval(outdoorTimer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Saat suhu luar update, perbarui garis di chart tanpa re-fetch ─────────
  useEffect(() => {
    if (outdoorTemp == null) return
    setChartData(prev =>
      prev.map(d => ({ ...d, suhuLuar: outdoorTemp }))
    )
  }, [outdoorTemp])

  // ─── Data card ────────────────────────────────────────────────────────────
  const cards = [
    {
      stats: avgTemp != null ? `${avgTemp}°C` : '...',
      title: 'Rata-rata Suhu',
      color: 'primary',
      icon:  'ri-temp-hot-line',
    },
    {
      stats: avgHum != null ? `${avgHum}%` : '...',
      title: 'Rata-rata Kelembapan',
      color: 'info',
      icon:  'ri-drop-line',
    },
    {
      stats: totalCount != null ? totalCount.toLocaleString() : '...',
      title: 'Total Data',
      color: 'warning',
      icon:  'ri-database-2-line',
    },
    {
      stats: devStatus,
      title: 'Status',
      color: devStatus === 'Online' ? 'success' : devStatus === 'Offline' ? 'error' : 'default',
      icon:  'ri-router-line',
    },
    {
      stats: outdoorTemp != null
        ? `${outdoorTemp}°C`
        : gpsStatus === 'error'   ? 'GPS Error'
        : gpsStatus === 'loading' ? '...'
        : '—',
      title: locationName ? `Suhu Luar (${locationName})` : 'Suhu Luar',
      color: 'secondary',
      icon:  'ri-sun-line',
    },
  ]

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <Card className='bs-full'>
      <CardHeader
        title='IoT Temperature + Humidity Monitor'
        action={
          <OptionMenu
            iconClassName='text-textPrimary'
            options={[
              { text: 'Refresh Semua',  menuItemProps: { onClick: fullRefresh  } },
              { text: 'Refresh Sensor', menuItemProps: { onClick: fetchSensor  } },
              { text: 'Refresh Cuaca',  menuItemProps: { onClick: fetchOutdoor } },
            ]}
          />
        }
        subheader={
          <Box className='mbs-1' sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <span className='font-medium text-textPrimary'>Smart Monitoring System</span>
            <span className='text-textSecondary'>— Kamar</span>
            {gpsStatus === 'loading' && <CircularProgress size={10} />}
            {gpsStatus === 'ok' && locationName && (
              <Chip label={`📍 ${locationName}`} size='small' sx={{ height: 18, fontSize: '0.65rem' }} />
            )}
            {gpsStatus === 'error' && (
              <Chip label='GPS tidak tersedia' size='small' color='error' sx={{ height: 18, fontSize: '0.65rem' }} />
            )}
          </Box>
        }
      />

      <CardContent className='!pbs-5'>
        {/* ── 5 STAT CARDS SEJAJAR ─────────────────────────────────────── */}
        <Grid container spacing={3}>
          {cards.map((item, i) => (
            <Grid item xs={12} sm={6} md={2.4} key={i}>
              <div className='flex items-center gap-3'>
                <CustomAvatar variant='rounded' color={item.color} skin='light' className='shrink-0 shadow-xs'>
                  <i className={item.icon} />
                </CustomAvatar>
                <div className='flex flex-col min-w-0'>
                  <Typography variant='caption' className='text-textSecondary' noWrap>
                    {item.title}
                  </Typography>
                  <Typography variant='h6' className='font-semibold' noWrap>
                    {item.stats}
                  </Typography>
                </div>
              </div>
            </Grid>
          ))}
        </Grid>

        {/* ── CHART ────────────────────────────────────────────────────── */}
        <Box sx={{ mt: 4 }}>
          <Box sx={{ mb: 1.5 }}>
            <Typography variant='subtitle1' fontWeight={600}>
              Tren Suhu Dalam vs Luar Ruangan
            </Typography>
            <Typography variant='caption' color='text.secondary'>
              {chartData.length > 0
                ? `Menampilkan ${chartData.length} titik dari ${DATA_LIMIT} data terakhir`
                : 'Memuat data...'}
              {outdoorTemp != null && ` · Suhu luar: ${outdoorTemp}°C`}
              {outdoorHum  != null && `, RH ${outdoorHum}%`}
            </Typography>
          </Box>

          {chartLoading && chartData.length === 0 ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 220 }}>
              <CircularProgress size={28} />
            </Box>
          ) : (
            <ResponsiveContainer width='100%' height={240}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray='3 3' opacity={0.25} />
                <XAxis
                  dataKey='waktu'
                  tick={{ fontSize: 10 }}
                  interval='preserveStartEnd'
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 10 }}
                  label={{ value: '°C', angle: -90, position: 'insideLeft', fontSize: 10 }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine y={30} stroke='#e74c3c' strokeDasharray='4 4'
                  label={{ value: 'Max 30°C', fontSize: 9, fill: '#e74c3c', position: 'insideTopRight' }} />
                <ReferenceLine y={26} stroke='#3498db' strokeDasharray='4 4'
                  label={{ value: 'Min 26°C', fontSize: 9, fill: '#3498db', position: 'insideBottomRight' }} />

                <Line
                  type='monotone'
                  dataKey='suhuDalam'
                  name='Suhu Dalam (°C)'
                  stroke='#e74c3c'
                  dot={false}
                  strokeWidth={2}
                  activeDot={{ r: 4 }}
                />

                {/* Hanya render jika outdoorTemp sudah ada */}
                {outdoorTemp != null && (
                  <Line
                    type='monotone'
                    dataKey='suhuLuar'
                    name={`Suhu Luar${locationName ? ` (${locationName})` : ''} (°C)`}
                    stroke='#f39c12'
                    dot={false}
                    strokeWidth={2}
                    strokeDasharray='6 3'
                    activeDot={{ r: 4 }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          )}

          {/* Keterangan warna */}
          <Box sx={{ display: 'flex', gap: 3, mt: 1, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
              <Box sx={{ width: 20, height: 2, bgcolor: '#e74c3c', borderRadius: 1 }} />
              <Typography variant='caption' color='text.secondary'>Suhu dalam ruangan</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
              <Box sx={{ width: 20, height: 2, bgcolor: '#f39c12', borderRadius: 1, opacity: outdoorTemp != null ? 1 : 0.35 }} />
              <Typography variant='caption' color='text.secondary'>
                {outdoorTemp != null
                  ? `Suhu luar (${outdoorTemp}°C${outdoorHum != null ? `, RH ${outdoorHum}%` : ''})`
                  : gpsStatus === 'loading' ? 'Mengambil lokasi GPS...'
                  : gpsStatus === 'error'   ? 'Suhu luar tidak tersedia'
                  : 'Menunggu data cuaca...'}
              </Typography>
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  )
}

export default IoTTempMonitor