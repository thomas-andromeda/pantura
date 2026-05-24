'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/libs/supabaseClient'
import { useAuth } from './AuthContext'

const DeviceContext = createContext({})

export const useDevice = () => useContext(DeviceContext)

export const DeviceProvider = ({ children }) => {
  const { user } = useAuth()
  const [devices, setDevices] = useState([])
  const [activeDevice, setActiveDeviceState] = useState(null)
  const [loading, setLoading] = useState(true)
  const isFirstLoad = useRef(true)

  // Fetch daftar device milik user
  const fetchDevices = useCallback(async () => {
    if (!user) {
      setDevices([])
      setActiveDeviceState(null)
      setLoading(false)
      return
    }

    if (isFirstLoad.current) {
      setLoading(true)
    }

    try {
      const { data, error } = await supabase
        .from('devices')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })

      if (error) throw error

      const deviceList = data || []
      setDevices(deviceList)
      isFirstLoad.current = false

      // Restore device aktif dari localStorage, atau pilih yang pertama
      const savedToken = localStorage.getItem('pantura_active_device')
      const savedDevice = deviceList.find(d => d.device_token === savedToken)

      if (savedDevice) {
        setActiveDeviceState(savedDevice)
      } else if (deviceList.length > 0) {
        setActiveDeviceState(deviceList[0])
        localStorage.setItem('pantura_active_device', deviceList[0].device_token)
      } else {
        setActiveDeviceState(null)
        localStorage.removeItem('pantura_active_device')
      }
    } catch (err) {
      console.error('Fetch devices error:', err.message)
    } finally {
      setLoading(false)
    }
  }, [user])

  // Fetch ulang saat user berubah
  useEffect(() => {
    fetchDevices()
  }, [fetchDevices])

  // Set device aktif
  const setActiveDevice = (device) => {
    setActiveDeviceState(device)
    if (device) {
      localStorage.setItem('pantura_active_device', device.device_token)
    }
  }

  // Tambah device baru
  const addDevice = async (deviceToken, deviceName) => {
    if (!user) throw new Error('Belum login')

    const { data, error } = await supabase
      .from('devices')
      .insert({
        device_token: deviceToken,
        device_name: deviceName,
        user_id: user.id,
        active_category_id: 1,
      })
      .select()
      .single()

    if (error) throw error

    await fetchDevices()

    // Set sebagai device aktif jika ini device pertama
    if (devices.length === 0) {
      setActiveDevice(data)
    }

    return data
  }

  // Update device (nama, dsb)
  const updateDevice = async (deviceId, updates) => {
    const { data, error } = await supabase
      .from('devices')
      .update(updates)
      .eq('id', deviceId)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) throw error

    await fetchDevices()
    return data
  }

  // Hapus device
  const deleteDevice = async (deviceId) => {
    const { error } = await supabase
      .from('devices')
      .delete()
      .eq('id', deviceId)
      .eq('user_id', user.id)

    if (error) throw error

    // Jika device yang dihapus adalah yang aktif, pindah ke device lain
    if (activeDevice?.id === deviceId) {
      const remaining = devices.filter(d => d.id !== deviceId)
      if (remaining.length > 0) {
        setActiveDevice(remaining[0])
      } else {
        setActiveDevice(null)
      }
    }

    await fetchDevices()
  }

  // Update mode/kategori aktif (1-4) untuk device tertentu
  const updateCategoryMode = async (deviceId, categoryId) => {
    const { data, error } = await supabase
      .from('devices')
      .update({ active_category_id: categoryId })
      .eq('id', deviceId)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) throw error

    // Update state lokal tanpa re-fetch
    setDevices(prev =>
      prev.map(d => d.id === deviceId ? { ...d, active_category_id: categoryId } : d)
    )

    if (activeDevice?.id === deviceId) {
      setActiveDeviceState(prev => ({ ...prev, active_category_id: categoryId }))
    }

    return data
  }

  const value = {
    devices,
    activeDevice,
    loading,
    setActiveDevice,
    fetchDevices,
    addDevice,
    updateDevice,
    deleteDevice,
    updateCategoryMode,
  }

  return (
    <DeviceContext.Provider value={value}>
      {children}
    </DeviceContext.Provider>
  )
}
