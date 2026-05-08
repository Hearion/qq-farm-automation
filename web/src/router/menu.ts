import type { Component } from 'vue'
import {
  DataLine,
  User,
  Avatar,
  TrendCharts,
  Setting,
  Tools,
} from '@element-plus/icons-vue'

export interface MenuItem {
  path: string
  name: string
  label: string
  icon: Component
  component: () => Promise<any>
  adminOnly?: boolean
}

export const menuRoutes: MenuItem[] = [
  {
    path: '',
    name: 'dashboard',
    label: '概览',
    icon: DataLine,
    component: () => import('@/views/Dashboard.vue'),
  },
  {
    path: 'personal',
    name: 'personal',
    label: '个人',
    icon: User,
    component: () => import('@/views/Personal.vue'),
  },
  {
    path: 'friends',
    name: 'friends',
    label: '好友',
    icon: Avatar,
    component: () => import('@/views/Friends.vue'),
  },
  {
    path: 'analytics',
    name: 'analytics',
    label: '分析',
    icon: TrendCharts,
    component: () => import('@/views/Analytics.vue'),
  },
  {
    path: 'settings',
    name: 'Settings',
    label: '设置',
    icon: Setting,
    component: () => import('@/views/Settings.vue'),
  },
  {
    path: 'admin',
    name: 'admin',
    label: '后台',
    icon: Tools,
    component: () => import('@/views/AdminPanel.vue'),
    adminOnly: true,
  },
]
