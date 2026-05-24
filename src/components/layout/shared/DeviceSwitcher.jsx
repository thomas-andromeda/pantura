'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useDevice } from '@/contexts/DeviceContext'
import { supabase } from '@/libs/supabaseClient'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import FormControl from '@mui/material/FormControl'
import CircularProgress from '@mui/material/CircularProgress'
import Button from '@mui/material/Button'

const DeviceSwitcher = () => {
  const { devices, activeDevice, loading, setActiveDevice } = useDevice()
  const [deviceStatuses, setDeviceStatuses] = useState({})

  // Cek status online/offline untuk setiap device
  useEffect(() => {
    if (devices.length === 0) return

    const checkStatuses = async () => {
      const statuses = {}
      for (const device of devices) {
        try {
          const { data, error } = await supabase
            .from('sensor_data')
            .select('created_at')
            .eq('device_token', device.device_token)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (error) throw error

          if (data?.created_at) {
            const lastActive = new Date(data.created_at)
            const diffInSeconds = (new Date() - lastActive) / 1000
            // Jika data terakhir kurang dari 45 detik yang lalu, anggap online
            statuses[device.device_token] = diffInSeconds < 45
          } else {
            statuses[device.device_token] = false
          }
        } catch (err) {
          console.error('Error checking status for', device.device_token, err)
          statuses[device.device_token] = false
        }
      }
      setDeviceStatuses(statuses)
    }

    checkStatuses()
    const interval = setInterval(checkStatuses, 30000) // update status setiap 30 detik

    return () => clearInterval(interval)
  }, [devices])

  if (loading) {
    return (
      <Box className='flex items-center gap-2 pl-2'>
        <CircularProgress size={16} color='primary' />
        <Typography variant='caption' color='textSecondary'>Memuat perangkat...</Typography>
      </Box>
    )
  }

  if (devices.length === 0) {
    return (
      <Button
        component={Link}
        href='/devices'
        variant='outlined'
        size='small'
        color='primary'
        startIcon={<i className='ri-add-line' />}
        sx={{ borderRadius: '8px', textTransform: 'none' }}
      >
        Tambah Perangkat
      </Button>
    )
  }

  const handleChange = (event) => {
    const selected = devices.find(d => d.id === event.target.value)
    if (selected) {
      setActiveDevice(selected)
    }
  }

  return (
    <FormControl size='small' sx={{ minWidth: 200 }}>
      <Select
        value={activeDevice?.id || ''}
        onChange={handleChange}
        displayEmpty
        renderValue={(selectedId) => {
          const device = devices.find(d => d.id === selectedId)
          if (!device) return <Typography variant='body2' color='text.secondary'>Pilih Perangkat</Typography>
          const isOnline = deviceStatuses[device.device_token] || false
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: isOnline ? 'success.main' : 'text.disabled',
                  flexShrink: 0
                }}
              />
              <Typography variant='body2' className='font-medium' noWrap sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                <span>{device.device_name}</span>
                <span style={{ fontSize: '0.7rem', opacity: 0.6, fontWeight: 400 }}>({device.device_token})</span>
              </Typography>
            </Box>
          )
        }}
        sx={{
          borderRadius: '8px',
          height: '38px',
          backgroundColor: 'background.paper',
          '& .MuiSelect-select': {
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            py: 0.5
          }
        }}
      >
        {devices.map((device) => {
          const isOnline = deviceStatuses[device.device_token] || false
          return (
            <MenuItem key={device.id} value={device.id}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: isOnline ? 'success.main' : 'text.disabled',
                    flexShrink: 0
                  }}
                />
                <Box sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <Typography variant='body2' className='font-medium' noWrap>
                    {device.device_name}
                  </Typography>
                  <Typography variant='caption' color='textSecondary' noWrap>
                    {device.device_token}
                  </Typography>
                </Box>
              </Box>
            </MenuItem>
          )
        })}
      </Select>
    </FormControl>
  )
}

export default DeviceSwitcher
