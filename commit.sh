#!/bin/bash
git add -A
git commit -m "$1" || (git add -A && git commit -m "$1")